// WhatsApp Cloud API webhook - Option B (rule-based qualification), per
// iaaj-crm-plan memory: build this before any open-ended AI agent, same
// number/infra either way so nothing here gets thrown away moving to
// Option A later, only this file's routing logic gets replaced.
//
// LIVE since 14 Aug 2026 on the Cloud API number +91 83798 34211. Env vars
// set in Vercel (do not treat this file as inert - it answers real leads):
//   WHATSAPP_TOKEN            - permanent access token from Meta
//   WHATSAPP_PHONE_NUMBER_ID  - the Cloud API phone number ID (not the number itself)
//   WHATSAPP_VERIFY_TOKEN     - any string you choose, entered in Meta's webhook config too
//
// This function only ever REPLIES to a message the lead sent first (guide
// download click, quiz completion, or a direct message), so every message
// it sends stays inside WhatsApp's 24-hour free-form reply window. That
// means none of this needs Meta template approval before launch - templates
// are only required for messages IAAJ sends cold (the reactivation
// campaign), not for this reactive qualification flow.
//
// Deliberately stateless: which message to send next is decided entirely
// by the button id the lead just tapped (see BUTTON IDS below), not by
// looking up "what step is this person on" anywhere. The one place this
// isn't quite free is free-text messages (see FREE TEXT HANDLING) - those
// do one read against the CRM to avoid re-asking someone who's already
// been through the flow.

const CRM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxhhkL_pBf91KHLSFaXlc8YOZR5rCgbQpSpMsQswF5e0zR9QdiVR0DkAXVoa-n9bVqS/exec';
const GRAPH_VERSION = 'v25.0';
// Not a secret - just a phone number, already hardcoded the same way in
// CRM_Backend.gs. Was a Vercel env var (process.env.GAURAV_WHATSAPP_NUMBER)
// but that turned out to not actually be set in production - every ping to
// Gaurav silently no-op'd behind the `if (process.env...)` guard with no
// error anywhere. Hardcoding removes that whole failure mode.
const GAURAV_WHATSAPP_NUMBER = '919403912211';

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return handleVerification(req, res);
  }
  if (req.method === 'POST') {
    return handleIncoming(req, res);
  }
  res.status(405).end();
};

// --- 1. WEBHOOK VERIFICATION (one-time handshake when you configure the
// webhook URL in Meta's dashboard) ---
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
}

// --- 2. INCOMING MESSAGE HANDLING ---
// Meta retries the webhook on anything other than a prompt 200, which would
// mean duplicate replies - so respond fast is the goal. It's tempting to
// call res.end() immediately and keep working after, but that relies on an
// assumption about whether Vercel's Node runtime keeps the function alive
// post-response, which isn't something to gamble on in code that can't be
// live-tested before launch. Doing the (fast: 1-2 HTTP calls) work first
// and responding once it's done is slightly slower but unambiguously
// correct, and still well inside Meta's timeout tolerance.
// Meta redelivers any webhook it believes failed, and this handler makes
// several sequential Apps Script calls before answering - so a slow run can
// be retried while the first one is still working, and the same tap gets
// processed twice: two identical replies to the lead, two pings to Gaurav.
// One such double-ping is visible in the 5 Sep data (same contact, same
// action, logged 29 seconds apart).
//
// Honest limit: this only catches retries that land on the SAME warm
// serverless instance. That covers the fast redeliveries this is aimed at,
// but it is a mitigation, not a lock - the CRM's own phone-level dedupe is
// what guarantees the stored data stays correct either way.
const RECENT_MESSAGE_IDS = new Map();
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;

function alreadyHandled(id) {
  if (!id) return false;
  const now = Date.now();
  for (const entry of RECENT_MESSAGE_IDS) {
    if (now - entry[1] > MESSAGE_ID_TTL_MS) RECENT_MESSAGE_IDS.delete(entry[0]);
  }
  if (RECENT_MESSAGE_IDS.has(id)) return true;
  RECENT_MESSAGE_IDS.set(id, now);
  return false;
}

async function handleIncoming(req, res) {
  try {
    const entry = req.body && req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];
    if (!message) { res.status(200).end(); return; } // status/delivery callbacks land here too, nothing to do

    if (alreadyHandled(message.id)) {
      console.log('duplicate webhook delivery ignored', message.id);
      res.status(200).end();
      return;
    }

    const from = message.from; // sender's number, no leading +
    const contactName = (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || '';

    if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
      await handleButtonReply(from, contactName, message.interactive.button_reply.id);
    } else if (message.type === 'button') {
      // A tap on a TEMPLATE message's quick-reply button (campaign sends
      // like the reactivation/old-leads messages) arrives in this shape,
      // not the 'interactive' shape above - that one is only for buttons
      // sent directly by this webhook (e.g. sendButtons() in the welcome
      // flow). Meta returns the button's own visible text as the payload
      // here (no custom id at template-creation time), so route by text,
      // not by an assumed opaque id.
      await handleTemplateButtonReply(from, contactName, (message.button && message.button.payload) || (message.button && message.button.text) || '');
    } else if (message.type === 'text') {
      await handleFreeText(from, contactName, (message.text && message.text.body) || '');
    } else {
      // Image/audio/document/etc - Option B has no rule for these.
      await sendText(from, "Thanks for that! Someone from the team will take a look and get back to you.");
    }
    res.status(200).end();
  } catch (err) {
    console.error('whatsapp-webhook error', err);
    // Still 200 - a 5xx here makes Meta retry the same message and could
    // double-send replies. Errors are visible in Vercel's function logs
    // (Project -> Deployments -> Functions) instead.
    res.status(200).end();
  }
}

// --- 3. FREE TEXT HANDLING ---
// Can't tell from the message alone whether this is someone's first-ever
// contact or a "thanks!" after finishing the flow, since nothing here
// tracks conversation state. Do one read against the CRM instead of
// guessing: if this phone number already has a qualified/logged lead,
// don't re-run the welcome flow, just acknowledge and let a human pick it
// up from the CRM. Otherwise treat it as a fresh start.
//
// Opt-out check comes first and short-circuits everything else - the
// reactivation template promises "reply STOP", so a STOP reply has to
// actually do something, not just fall through to the welcome flow.
const OPT_OUT_WORDS = ['stop', 'unsubscribe', 'opt out', 'optout'];

async function handleFreeText(from, contactName, text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (OPT_OUT_WORDS.indexOf(normalized) !== -1) {
    await handleOptOut(from, contactName);
    return;
  }

  // Buying intent outranks everything below it - see PURCHASE INTENT.
  const intent = detectPurchaseIntent(text);
  if (intent) {
    await handlePurchaseIntent(from, contactName, intent);
    return;
  }

  // A past client who got the reactivation campaign but typed their own
  // reply instead of tapping "I'm interested"/"Not right now" would
  // otherwise fall into findExistingLead (not found, since past clients
  // aren't in this CRM yet) and land in sendWelcome - the generic
  // "pick your condition" quiz, a jarring experience for someone who just
  // got a personal "come back" message from Gaurav by name. Checked before
  // findExistingLead/sendWelcome for the same reason purchase intent is.
  // Both lookups are independent CRM reads, so they run together rather
  // than one after the other. Sequentially they were the slowest part of
  // this path (findExistingLead downloads the entire lead list), and that
  // latency is what pushes a run past Meta's patience and triggers the
  // duplicate redelivery guarded against above. Costs one extra request
  // when the person turns out to be a past client; saves a full
  // round-trip of waiting on every text message.
  const [pastClientStatus, existing] = await Promise.all([
    checkPastClientStatus_(from),
    findExistingLead(from)
  ]);

  if (pastClientStatus.isPastClient && !pastClientStatus.isActiveClient) {
    if (CAMPAIGN_DECLINE_RE.test(normalized)) {
      await handleReactivationNotNow_(from, contactName);
    } else {
      await handleReactivationInterested_(from, contactName);
    }
    return;
  }

  if (existing) {
    await sendText(from, "Thanks for the message! Your Journey Master or a team member will get back to you shortly.");
    return;
  }
  await sendWelcome(from, contactName);
}

// Matches the same "no thanks" language the button-tap path already
// treats as a decline - anything else from a known past client is treated
// as interested, since replying at all to a cold reactivation message is
// itself a strong positive signal, and the cost of a false "interested" is
// just Gaurav messaging someone who clarifies they're not up for it.
const CAMPAIGN_DECLINE_RE = /not interest|not right now|no thanks|not now|maybe later|not for me|can'?t afford|cannot afford|too expensive|costly|don'?t want|do not want|stop|unsubscribe/i;

async function checkPastClientStatus_(phone) {
  try {
    const resp = await fetch(CRM_ENDPOINT + '?action=past_client_lookup&phone=' + encodeURIComponent(phone), { redirect: 'follow' });
    const data = await resp.json();
    return { isPastClient: !!(data && data.isPastClient), isActiveClient: !!(data && data.isActiveClient) };
  } catch (e) {
    return { isPastClient: false, isActiveClient: false }; // fail open, same pattern as findExistingLead
  }
}

// Logged the same way as a reactivation "not now" reply (see
// handleButtonReply) so the reactivation sender script's opt-out check -
// reading the CRM for "do not re-send"/"opted out" in notes - catches
// this too, with no separate opt-out list to keep in sync.
async function handleOptOut(from, contactName) {
  await logToCrm({
    name: contactName || '',
    phone: from,
    condition: '',
    qualification: 'High Intent',
    source: 'WhatsApp Opt-Out',
    notes: 'Replied STOP/unsubscribe. OPTED OUT, do not re-send any campaign to them.'
  });
  await sendText(from, "You're unsubscribed and won't get any more messages from us here. Take care!");
}

// --- 3b. PURCHASE INTENT (money in hand - must never hit the quiz) ---
// Every string below is produced by a button on the site: contact.html's
// consult/challenge CTAs and program.html's .plan-wa-btn pricing buttons
// all open wa.me with a prefilled message naming the exact plan. So this
// is matching text we author, not guessing at open-ended language. It
// still matches on distinctive substrings rather than whole strings,
// because WhatsApp lets people edit a prefilled message before sending.
//
// Checked BEFORE findExistingLead deliberately: a past lead coming back to
// buy would otherwise hit the "someone will get back to you shortly" reply,
// which is the worst possible answer to "I want to make payment". Checked
// before sendWelcome for the same reason - asking "what are you dealing
// with?" of someone who already picked a plan and named a price loses them.
const PURCHASE_INTENTS = [
  {
    id: 'consultation',
    label: 'One-time consultation (₹1,999)',
    match: function (t) { return /one[\s-]?time consultation/.test(t); }
  },
  {
    id: 'challenge',
    label: '7-Day Challenge (₹799)',
    match: function (t) { return /(7|seven)[\s-]*day challenge/.test(t); }
  },
  {
    id: 'bless90',
    label: 'BLESS 90',
    match: function (t) { return /bless\s*90/.test(t); },
    // The four pricing buttons differ only by PT and duration. Naming the
    // exact one back to them is what proves a human-grade reply landed.
    // 'without pt' is tested first: 'with pt' is not a substring of it,
    // but ordering makes that non-obvious property explicit rather than load-bearing.
    detail: function (t) {
      var pt = /without\s*pt/.test(t) ? 'without PT' : (/with\s*pt/.test(t) ? 'with PT' : '');
      var months = /6\s*month/.test(t) ? '6 months' : (/3\s*month/.test(t) ? '3 months' : '');
      return [pt, months].filter(Boolean).join(', ');
    }
  },
  {
    // Catch-all for someone typing their own words instead of tapping a
    // button. Last, so a named plan above always wins.
    id: 'generic',
    label: '',
    match: function (t) {
      return /make (a )?payment|want to pay|how (do i|to) pay|payment link|send me the link|sign me up|want to enroll|want to enrol/.test(t);
    }
  }
];

function detectPurchaseIntent(text) {
  var t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (var i = 0; i < PURCHASE_INTENTS.length; i++) {
    var intent = PURCHASE_INTENTS[i];
    if (!intent.match(t)) continue;
    var detail = intent.detail ? intent.detail(t) : '';
    return { id: intent.id, label: detail ? intent.label + ' (' + detail + ')' : intent.label };
  }
  return null;
}

// Option 2 of the payment-handling choices: acknowledge instantly and hand
// to a human, rather than the bot sending a payment link itself. Picked
// because it needs no payment infrastructure to exist yet, and still
// removes the part that actually loses buyers - the silence between "I
// want to pay" and a human noticing. The link itself still comes from a
// person, which is also why the copy below promises a person, not a bot.
//
// Note the reply deliberately does NOT promise a number of minutes. A
// Cloud API number can't be answered from a phone, so the real reply time
// depends on a rep being awake; over-promising here would burn exactly the
// trust this business runs on.
async function handlePurchaseIntent(from, contactName, intent) {
  const firstName = contactName ? contactName.split(' ')[0] : 'there';
  const knowsPlan = intent.id !== 'generic';

  await logToCrm({
    name: contactName || '',
    phone: from,
    condition: '',
    qualification: 'QUALIFIED',
    source: 'WhatsApp Payment Intent',
    notes: 'WANTS TO PAY' + (knowsPlan ? ' - ' + intent.label : '') + '. Send payment link and confirm slot.'
  });

  const opening = knowsPlan
    ? 'Perfect, ' + firstName + '! 🎉\n\n*' + intent.label + '*, got it.'
    : 'Perfect, ' + firstName + '! 🎉\n\nGot it, let\'s get you started.';

  await sendText(
    from,
    opening +
    '\n\nThe team has been alerted and your payment link and confirmation will come through right here shortly (first thing in the morning if it\'s late where you are).' +
    '\n\nNothing else for you to do. If there\'s anything you\'d like your coach to know before we set you up, just send it here.'
  );

  // The rep can't reply from the API number (Cloud API numbers are locked
  // out of the WhatsApp app), so the ping carries a wa.me deep link - one
  // tap opens the chat from their own WhatsApp, which is where the payment
  // link or UPI QR actually gets sent from.
  await sendText(
    GAURAV_WHATSAPP_NUMBER,
    '💰 PAYMENT INTENT: send link now\n' +
    'Plan: ' + (knowsPlan ? intent.label : 'not specified, ask them') + '\n' +
    contactBlock(contactName, from)
  );
}

async function findExistingLead(phone) {
  try {
    const resp = await fetch(CRM_ENDPOINT, { redirect: 'follow' });
    const data = await resp.json();
    const leads = (data && data.leads) || [];
    const normalized = String(phone).replace(/\D/g, '').slice(-10);
    return leads.find(function (l) {
      return String(l.phone || '').replace(/\D/g, '').slice(-10) === normalized;
    });
  } catch (e) {
    return null; // if the CRM read fails, fail open to the welcome flow rather than block the reply entirely
  }
}

// --- 4. WELCOME + CONDITION BUTTONS (first touch) ---
async function sendWelcome(to, name) {
  const firstName = name ? name.split(' ')[0] : 'there';
  await sendButtons(
    to,
    `Hey ${firstName}! This is the IAAJ team 💛 We help women with PCOS, thyroid and hormonal fat loss with a plan built around their actual body. What are you dealing with?`,
    [
      { id: 'cond_pcos', title: 'PCOS / PCOD' },
      { id: 'cond_thyroid', title: 'Thyroid' },
      { id: 'cond_other', title: 'Not sure yet' }
    ]
  );
}

// --- 5. BUTTON REPLY ROUTING ---
// The button id carries the whole state transition - see the id naming
// below. Nothing here needs a database lookup to know what to send next.
async function handleButtonReply(from, name, buttonId) {
  if (buttonId.indexOf('cond_') === 0) {
    const condition = conditionLabel(buttonId);
    await sendButtons(
      from,
      `Got it. And how ready are you to actually start fixing this?`,
      [
        { id: 'ready_now_' + buttonId.slice(5), title: 'Ready now' },
        { id: 'ready_month_' + buttonId.slice(5), title: 'Within a month' },
        { id: 'ready_explore_' + buttonId.slice(5), title: 'Just exploring' }
      ]
    );
    return;
  }

  if (buttonId.indexOf('ready_') === 0) {
    const parts = buttonId.split('_'); // ['ready', 'now'|'month'|'explore', <condition slug>]
    const readiness = parts[1];
    const condition = conditionLabel('cond_' + parts.slice(2).join('_'));
    const qualified = readiness === 'now';

    await logToCrm({
      name: name || '',
      phone: from,
      condition: condition,
      qualification: qualified ? 'QUALIFIED' : 'High Intent',
      source: 'WhatsApp Cloud API',
      notes: 'Readiness: ' + readinessLabel(readiness)
    });

    if (qualified) {
      await sendText(from, "That's exactly the mindset that gets results. Someone from the team will reach out to you shortly to get you started. Talk soon!");
      await sendText(
        GAURAV_WHATSAPP_NUMBER,
        '🔥 Qualified lead from WhatsApp\n' + contactBlock(name, from) + '\nCondition: ' + condition
      );
    } else {
      await sendText(from, "No pressure at all. Here are our free guides to get you started whenever you're ready: https://itsallaboutjourney.com/guides");
    }
    return;
  }

  // Reactivation campaign replies, for whenever the TRUE past-client list
  // (people who actually paid and finished a program) gets built and sent
  // via iaaj_reactivation_v1 - see handleReactivationInterested_/NotNow_
  // below for the actual behavior. Kept reachable by id here too in case a
  // future direct interactive send ever reuses these ids, but the real
  // path for a TEMPLATE button tap is handleTemplateButtonReply below (see
  // the 'button' vs 'interactive' message-type split in handleIncoming).
  if (buttonId === 'reactivation_interested') { await handleReactivationInterested_(from, name); return; }
  if (buttonId === 'reactivation_not_now') { await handleReactivationNotNow_(from, name); return; }

  // Unrecognized id (shouldn't happen unless buttons are edited without
  // updating this file) - fail safe to a human handoff rather than silence.
  await sendText(from, "Thanks! Someone from the team will follow up with you shortly.");
}

// --- 5b. TEMPLATE BUTTON REPLY ROUTING ---
// Quick-reply buttons on a TEMPLATE message (any outbound campaign, not a
// direct interactive send from this webhook) arrive as message.type ===
// 'button' with the button's own visible TEXT as the payload - Meta's
// template-creation API for QUICK_REPLY buttons doesn't take a separate
// custom id, so matching on the exact text this webhook also defines the
// template with is the correct approach, not a workaround. Case-sensitive
// exact match is fine here (unlike free-text parsing) since a tapped
// button's payload is never user-edited, unlike a prefilled wa.me message.
async function handleTemplateButtonReply(from, name, payload) {
  var text = String(payload || '').trim();

  // iaaj_old_leads_reconnect_v2 - today's campaign, sent to the Master
  // Leads consolidation (old website/Instagram enquiries that never
  // converted). Deliberately separate copy and CRM source from the true
  // reactivation flow below - these people never paid, so anything that
  // implies otherwise (like the reactivation flow's "book your ₹1,999
  // consultation... credited toward a new program if you CONTINUE") would
  // be false for nearly all of them.
  if (text === 'Tell me more') {
    // assignedRep 'Gaurav' on every campaign reply, interested or not:
    // these are Gaurav's own outreach and he handles them personally, so
    // they must never enter the Sales Rep 1/2 round-robin. Declines get
    // his name too, so the whole campaign sits in one place he can see
    // rather than being split across three different rep views.
    const saved = await logToCrm({
      name: name || '',
      phone: from,
      condition: '',
      qualification: 'QUALIFIED',
      source: 'Old Leads Reconnect Campaign',
      assignedRep: 'Gaurav',
      notes: 'Old enquiry lead, replied INTERESTED when re-contacted about the current PCOS/thyroid program.'
    });
    await sendText(from, "That's great to hear! Gaurav will reach out to you shortly to see how we can help. Talk soon!");
    await sendText(
      GAURAV_WHATSAPP_NUMBER,
      '🔥 INTERESTED - old leads campaign\n' + contactBlock(name, from) + crmWarning(saved)
    );
    return;
  }

  if (text === 'Not for me') {
    await logToCrm({
      name: name || '',
      phone: from,
      condition: '',
      qualification: 'High Intent',
      status: 'Lost',
      source: 'Old Leads Reconnect Campaign',
      assignedRep: 'Gaurav',
      notes: 'Old enquiry lead, replied NOT INTERESTED when re-contacted. Do not re-send this campaign to them.'
    });
    await sendText(from, "Totally understood, no pressure at all. Thanks for letting us know, and take care!");
    return;
  }

  // iaaj_reactivation_v1 - true past-client reactivation (that list isn't
  // built yet, see IAAJ_WhatsApp_API_Build.md section 3), kept ready here
  // so this file doesn't need touching again once it exists.
  if (text === "I'm interested") { await handleReactivationInterested_(from, name); return; }
  if (text === 'Not right now') { await handleReactivationNotNow_(from, name); return; }

  // Unrecognized button text (template edited without updating this file,
  // or a template this webhook doesn't know about yet) - fail safe to a
  // human handoff rather than silence.
  await sendText(from, "Thanks! Someone from the team will follow up with you shortly.");
}

async function handleReactivationInterested_(from, name) {
  // assignedRep: 'Gaurav' keeps this out of the Sales Rep 1/2 round-robin
  // pool entirely (CRM_Backend.gs honors an explicit assignedRep the same
  // way it already honors an explicit status) - a past client saying
  // they're interested goes straight to Gaurav for a personal
  // conversation, not into a rep's queue.
  const saved = await logToCrm({
    name: name || '',
    phone: from,
    condition: '',
    qualification: 'QUALIFIED',
    source: 'Reactivation Campaign',
    assignedRep: 'Gaurav',
    notes: 'Past client, replied INTERESTED to reactivation message. Handling personally, not routed to a sales rep.'
  });
  await sendText(from, "So glad to hear that! Gaurav will personally reach out to you shortly to catch up and get you sorted.");
  await sendText(
    GAURAV_WHATSAPP_NUMBER,
    '🔥 INTERESTED - past client reactivation\n' + contactBlock(name, from) + crmWarning(saved)
  );
}

async function handleReactivationNotNow_(from, name) {
  await logToCrm({
    name: name || '',
    phone: from,
    condition: '',
    qualification: 'High Intent',
    status: 'Lost',
    source: 'Reactivation Campaign',
    assignedRep: 'Gaurav',
    notes: 'Past client, replied NOT RIGHT NOW. Do not re-send this campaign to them.'
  });
  await sendText(from, "Totally understood, no pressure at all. The door's always open whenever you're ready. Take care!");
}

function conditionLabel(condId) {
  var map = { cond_pcos: 'PCOS/PCOD', cond_thyroid: 'Thyroid', cond_other: 'Not sure yet' };
  return map[condId] || 'Not sure yet';
}

function readinessLabel(key) {
  var map = { now: 'Ready now', month: 'Within a month', explore: 'Just exploring' };
  return map[key] || key;
}

// --- 6. CRM LOGGING ---
// Same field contract as the enquiry form's direct-to-CRM POST in
// js/script.js (name, phone, condition, qualification, source, notes) -
// this is a second source feeding the same sheet/round-robin logic, not a
// new schema.
// Returns true only when the CRM actually confirmed the write.
//
// This used to be a bare `.catch(function () {})` - every failure mode
// (Apps Script lock timeout during a campaign blast, a 500, a network
// blip) vanished without a trace, and the caller carried on and pinged
// Gaurav "logged to CRM" for a person who was never saved. That silent
// swallow is exactly why the WhatsApp notifications and the CRM stopped
// agreeing with each other. Two things changed: fetch resolving is no
// longer treated as success (it does NOT reject on a 4xx/5xx, so the
// response has to be inspected), and one retry covers the transient
// lock-contention case that caused most of the losses.
async function logToCrm(fields) {
  const body = new URLSearchParams(fields);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(CRM_ENDPOINT, { method: 'POST', body: body, redirect: 'follow' });
      if (resp.ok) {
        const text = await resp.text();
        if (text.indexOf('"status":"success"') !== -1) return true;
        console.error('logToCrm: CRM returned a non-success body', text.slice(0, 200));
      } else {
        console.error('logToCrm: CRM returned HTTP', resp.status);
      }
    } catch (err) {
      console.error('logToCrm attempt ' + attempt + ' threw', err);
    }
    if (attempt === 1) await new Promise(function (r) { setTimeout(r, 1500); });
  }
  return false;
}

// Appended to Gaurav's ping when the CRM write failed, so a lead that
// didn't save is visible immediately in the one place he actually reads,
// instead of being discovered days later by comparing two lists by hand.
function crmWarning(saved) {
  return saved ? '' : '\n\n⚠️ NOT SAVED TO CRM - add this person manually.';
}

// The contact block every ping to Gaurav uses.
//
// `from` arrives from Meta as bare digits with no plus (919510525001).
// Pasted into a message like that, WhatsApp and iOS read it as a local
// number, so tapping it either did nothing useful or opened a mangled
// half-number - which is why these pings were not actionable from the
// phone. Two fixes, both needed: the displayed number gets a leading +
// so it is recognized as E.164 and dials correctly, and every ping now
// carries a wa.me link, which is the one-tap path straight into the chat
// (previously only two of the four pings had one).
function contactBlock(name, from) {
  const digits = String(from || '').replace(/\D/g, '');
  return 'Name: ' + (name || 'unknown') +
    '\nPhone: +' + digits +
    '\nChat: https://wa.me/' + digits;
}

// --- 7. SENDING MESSAGES (Meta Cloud API) ---
async function sendText(to, body) {
  return graphSend({
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: body }
  });
}

async function sendButtons(to, bodyText, buttons) {
  // Cloud API allows a maximum of 3 reply buttons per message.
  return graphSend({
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(function (b) {
          return { type: 'reply', reply: { id: b.id, title: b.title } };
        })
      }
    }
  });
}

async function graphSend(payload) {
  const url = 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + process.env.WHATSAPP_PHONE_NUMBER_ID + '/messages';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.WHATSAPP_TOKEN
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(function () { return ''; });
    console.error('WhatsApp send failed', resp.status, errBody);
  }
  return resp;
}
