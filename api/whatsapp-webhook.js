// WhatsApp Cloud API webhook - Option B (rule-based qualification), per
// iaaj-crm-plan memory: build this before any open-ended AI agent, same
// number/infra either way so nothing here gets thrown away moving to
// Option A later, only this file's routing logic gets replaced.
//
// NOT LIVE YET. Needs three env vars set in Vercel once the number exists:
//   WHATSAPP_TOKEN            - permanent access token from Meta
//   WHATSAPP_PHONE_NUMBER_ID  - the Cloud API phone number ID (not the number itself)
//   WHATSAPP_VERIFY_TOKEN     - any string you choose, entered in Meta's webhook config too
//   GAURAV_WHATSAPP_NUMBER    - E.164 format, e.g. 919403912211, no leading +
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
async function handleIncoming(req, res) {
  try {
    const entry = req.body && req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];
    if (!message) { res.status(200).end(); return; } // status/delivery callbacks land here too, nothing to do

    const from = message.from; // sender's number, no leading +
    const contactName = (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || '';

    if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
      await handleButtonReply(from, contactName, message.interactive.button_reply.id);
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

  const existing = await findExistingLead(from);
  if (existing) {
    await sendText(from, "Thanks for the message! Your Journey Master or a team member will get back to you shortly.");
    return;
  }
  await sendWelcome(from, contactName);
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
      if (process.env.GAURAV_WHATSAPP_NUMBER) {
        await sendText(
          process.env.GAURAV_WHATSAPP_NUMBER,
          '🔥 Qualified lead from WhatsApp\nName: ' + (name || 'unknown') + '\nPhone: ' + from + '\nCondition: ' + condition + '\nReady now, logged to CRM.'
        );
      }
    } else {
      await sendText(from, "No pressure at all. Here are our free guides to get you started whenever you're ready: https://itsallaboutjourney.com/guides");
    }
    return;
  }

  // Reactivation campaign replies. These button ids come from the
  // iaaj_reactivation_v1 Meta template (see IAAJ_WhatsApp_API_Build.md) -
  // this file's routing doesn't send these buttons itself, it only handles
  // the tap once the template's gone out.
  if (buttonId === 'reactivation_interested') {
    await logToCrm({
      name: name || '',
      phone: from,
      condition: '',
      qualification: 'QUALIFIED',
      source: 'Reactivation Campaign',
      notes: 'Past client, replied interested to reactivation message.'
    });
    await sendText(from, "So glad to hear that! To book your ₹1,999 consultation (fully credited toward a new program if you continue), just reply here and the team will send you a payment link and get you scheduled.");
    if (process.env.GAURAV_WHATSAPP_NUMBER) {
      await sendText(
        process.env.GAURAV_WHATSAPP_NUMBER,
        '👋 Past client replied to reactivation campaign\nName: ' + (name || 'unknown') + '\nPhone: ' + from + '\nWants to come back, logged to CRM as QUALIFIED.'
      );
    }
    return;
  }

  if (buttonId === 'reactivation_not_now') {
    await logToCrm({
      name: name || '',
      phone: from,
      condition: '',
      qualification: 'High Intent',
      source: 'Reactivation Campaign',
      notes: 'Past client, replied not right now. Do not re-send this campaign to them.'
    });
    await sendText(from, "Totally understood, no pressure at all. The door's always open whenever you're ready. Take care!");
    return;
  }

  // Unrecognized id (shouldn't happen unless buttons are edited without
  // updating this file) - fail safe to a human handoff rather than silence.
  await sendText(from, "Thanks! Someone from the team will follow up with you shortly.");
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
async function logToCrm(fields) {
  const body = new URLSearchParams(fields);
  await fetch(CRM_ENDPOINT, { method: 'POST', body: body }).catch(function () {});
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
