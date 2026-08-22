/**
 * IAAJ Master Sales CRM — Google Apps Script Backend (High-Intent Sales Pipeline)
 * 
 * Strategy:
 * - Only High-Intent leads (Website Enquiries & Superreply IG DMs) enter the Master Sales CRM for sales calls.
 * - Top-of-Funnel leads (Free Guides & Quiz) stay in their dedicated sheets for automated Email & WhatsApp Nurture.
 * 
 * Instructions:
 * 1. Open script.google.com in an incognito window signed into iaajofficial1@gmail.com.
 * 2. Create a new Apps Script project named "IAAJ Master Sales CRM".
 * 3. Bind it to a Google Sheet named "IAAJ Master Sales CRM" (or paste inside the sheet's Extensions -> Apps Script).
 * 4. Ensure two tabs exist in the Google Sheet:
 *    - "All Leads" (Headers: Lead ID, Date & Time, Name, WhatsApp / Phone, Email, City, Source, Hormonal Condition, Qualification, Lead Status, Assigned Rep, Last Contacted, Next Follow-up Date, Notes)
 *    - "Settings"  (Cell A1: "DistributionMode", Cell B1: "MANUAL", Cell A2: "LastAssignedIndex", Cell B2: "0")
 * 5. Deploy as Web App (Execute as: Me, Access: Anyone).
 */

var GAURAV_EMAIL = '21manifestation@gmail.com';

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('All Leads') || ss.getSheets()[0];
  var settingsSheet = ss.getSheetByName('Settings');
  
  var data = sheet.getDataRange().getValues();
  var leads = [];
  
  if (data.length > 1) {
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0] && !row[2]) continue; // Skip empty rows
      leads.push({
        leadId: row[0] || ('LEAD-' + (1000 + i)),
        date: row[1] ? new Date(row[1]).toISOString() : '',
        name: row[2] || '',
        phone: row[3] || '',
        email: row[4] || '',
        city: row[5] || '',
        source: row[6] || 'Website Enquiry',
        condition: row[7] || 'General',
        qualification: row[8] || 'QUALIFIED',
        status: row[9] || 'New',
        assignedRep: row[10] || 'Unassigned',
        lastContacted: row[11] ? new Date(row[11]).toISOString() : '',
        nextFollowUp: row[12] ? new Date(row[12]).toISOString() : '',
        notes: row[13] || ''
      });
    }
  }
  
  var mode = 'MANUAL';
  if (settingsSheet) {
    var modeVal = settingsSheet.getRange('B1').getValue();
    if (modeVal) mode = modeVal.toString().trim();
  }
  
  var result = {
    status: 'success',
    settings: {
      distributionMode: mode,
      reps: ['Gaurav', 'Sales Rep 1', 'Sales Rep 2']
    },
    leads: leads
  };
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('All Leads') || ss.getSheets()[0];
    var settingsSheet = ss.getSheetByName('Settings');
    
    // Auto-create Settings sheet if missing
    if (!settingsSheet) {
      settingsSheet = ss.insertSheet('Settings');
      settingsSheet.getRange('A1:B1').setValues([['DistributionMode', 'MANUAL']]);
      settingsSheet.getRange('A2:B2').setValues([['LastAssignedIndex', 0]]);
    }
    
    var p = e.parameter || {};
    var action = p.action || 'ingest';
    
    // --- ACTION: Update Lead Status / Rep / Notes ---
    if (action === 'update_lead') {
      var targetId = p.leadId;
      var data = sheet.getDataRange().getValues();
      var found = false;
      
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] == targetId) {
          if (p.status !== undefined) sheet.getRange(i + 1, 10).setValue(p.status);
          if (p.assignedRep !== undefined) sheet.getRange(i + 1, 11).setValue(p.assignedRep);
          if (p.lastContacted !== undefined) sheet.getRange(i + 1, 12).setValue(p.lastContacted ? new Date(p.lastContacted) : '');
          if (p.nextFollowUp !== undefined) sheet.getRange(i + 1, 13).setValue(p.nextFollowUp ? new Date(p.nextFollowUp) : '');
          if (p.notes !== undefined) sheet.getRange(i + 1, 14).setValue(p.notes);
          found = true;
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: found ? 'success' : 'not_found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- ACTION: Update Settings (Distribution Mode) ---
    if (action === 'update_settings') {
      if (p.distributionMode) {
        settingsSheet.getRange('B1').setValue(p.distributionMode);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', mode: p.distributionMode }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- ACTION: Ingest New High-Intent Lead ---
    var sourceStr = p.source || p.page || 'Website Enquiry';
    
    // Safety Filter: Skip cold lead sources if posted by mistake
    if (sourceStr.indexOf('Free guide') > -1 || sourceStr.indexOf('Quiz') > -1) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'skipped', reason: 'Top of funnel lead reserved for email/WA nurture' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var now = new Date();
    var totalRows = sheet.getLastRow();
    var leadId = 'LEAD-' + (1000 + totalRows);
    
    // Opt-outs (and any caller that explicitly says this lead is already
    // closed, e.g. a campaign "not interested" reply) must never look like
    // a workable "New" lead - a rep scanning the daily digest by
    // status/count, not reading every note, could otherwise call someone
    // who already declined. p.status lets a caller like the WhatsApp
    // webhook say so explicitly (e.g. status: 'Lost' on a decline reply);
    // without it this still falls back to the original Opt-Out-only rule,
    // so nothing already relying on that default behavior changes.
    // Checked before round-robin assignment so a closed lead never
    // consumes a rotation slot for an assignment that's discarded anyway.
    var isOptOut = sourceStr === 'WhatsApp Opt-Out';
    var initialStatus = p.status || (isOptOut ? 'Do Not Contact' : 'New');
    var isClosedOnArrival = initialStatus === 'Do Not Contact' || initialStatus === 'Lost';

    var distributionMode = settingsSheet.getRange('B1').getValue() || 'MANUAL';
    var assignedRep = 'Unassigned';

    if (distributionMode === 'ROUND_ROBIN' && !isClosedOnArrival) {
      var reps = ['Sales Rep 1', 'Sales Rep 2'];
      var lastIdx = parseInt(settingsSheet.getRange('B2').getValue() || '0', 10);
      var nextIdx = (lastIdx + 1) % reps.length;
      assignedRep = reps[nextIdx];
      settingsSheet.getRange('B2').setValue(nextIdx);
    }

    var leadName = p.name || '';
    var leadPhone = p.phone || p.whatsapp || '';
    var leadCondition = p.condition || p.city || 'PCOS/Thyroid';
    var qualification = p.qualification || (sourceStr.indexOf('QUALIFIED') > -1 ? 'QUALIFIED' : 'High Intent');

    sheet.appendRow([
      leadId,
      now,
      leadName,
      leadPhone,
      p.email || '',
      p.city || '',
      sourceStr,
      leadCondition,
      qualification,
      initialStatus,
      assignedRep,
      '', // Last Contacted
      '', // Next Follow-up
      p.notes || p.guides || ''
    ]);

    // Instant email backup for hot leads, same choke point every lead
    // source (website enquiry, WhatsApp, reactivation, Superreply IG)
    // already passes through - so this covers all of them, not just one.
    // Wrapped so a mail failure never blocks the lead actually saving.
    if (qualification === 'QUALIFIED') {
      try {
        notifyGauravOfQualifiedLead(leadId, leadName, leadPhone, leadCondition, sourceStr, assignedRep);
      } catch (mailErr) {
        // swallow - the lead is already saved, a missed email isn't worth failing the request over
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', leadId: leadId, assignedRep: assignedRep }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Instant qualified-lead email (backup to the WhatsApp ping, in case a
// ping is ever missed - this is the searchable record)
// ---------------------------------------------------------------------------

function notifyGauravOfQualifiedLead(leadId, name, phone, condition, source, assignedRep) {
  var subject = '🔥 Qualified lead: ' + (name || 'Unnamed') + ' (' + condition + ')';
  var html =
    '<div style="font-family:Arial,sans-serif;color:#222;max-width:520px">' +
    '<h2 style="margin-bottom:8px">A qualified lead just came in</h2>' +
    '<table style="border-collapse:collapse;width:100%;margin:14px 0">' +
    '<tr><td style="padding:4px 0;color:#666">Name</td><td style="padding:4px 0"><strong>' + escapeHtmlForEmail(name || 'Unnamed') + '</strong></td></tr>' +
    '<tr><td style="padding:4px 0;color:#666">Phone</td><td style="padding:4px 0"><strong>' + escapeHtmlForEmail(phone || '') + '</strong></td></tr>' +
    '<tr><td style="padding:4px 0;color:#666">Condition</td><td style="padding:4px 0">' + escapeHtmlForEmail(condition || '') + '</td></tr>' +
    '<tr><td style="padding:4px 0;color:#666">Source</td><td style="padding:4px 0">' + escapeHtmlForEmail(source || '') + '</td></tr>' +
    '<tr><td style="padding:4px 0;color:#666">Assigned to</td><td style="padding:4px 0">' + escapeHtmlForEmail(assignedRep || 'Unassigned') + '</td></tr>' +
    '<tr><td style="padding:4px 0;color:#666">Lead ID</td><td style="padding:4px 0">' + escapeHtmlForEmail(leadId || '') + '</td></tr>' +
    '</table>' +
    '<p><a href="https://itsallaboutjourney.com/crm" style="background:#e8113c;color:#fff;padding:12px 16px;text-decoration:none;border-radius:5px;font-weight:bold">Open CRM</a></p>' +
    '</div>';

  MailApp.sendEmail({ to: GAURAV_EMAIL, subject: subject, htmlBody: html });
}

// ---------------------------------------------------------------------------
// Daily sales follow-up email
// ---------------------------------------------------------------------------
// Setup once in the Apps Script editor:
// 1. In Settings add: SalesRep1Email | rep-one@email.com
//                    SalesRep2Email | rep-two@email.com
// 2. Run setupDailySalesReminder() once and approve permissions.
// It creates one 9 AM daily trigger in the script project's timezone.

function getSettingsMap(settingsSheet) {
  var values = settingsSheet.getDataRange().getValues();
  var settings = {};
  for (var i = 0; i < values.length; i++) {
    if (values[i][0]) settings[String(values[i][0]).trim()] = String(values[i][1] || '').trim();
  }
  return settings;
}

function setupDailySalesReminder() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailySalesReminder') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sendDailySalesReminder').timeBased().everyDays(1).atHour(9).create();
}

function sendDailySalesReminder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('All Leads') || ss.getSheets()[0];
  var settingsSheet = ss.getSheetByName('Settings');
  if (!settingsSheet) return;

  var settings = getSettingsMap(settingsSheet);
  var reps = [
    { name: 'Sales Rep 1', email: settings.SalesRep1Email },
    { name: 'Sales Rep 2', email: settings.SalesRep2Email }
  ];
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  reps.forEach(function(rep) {
    if (!rep.email) return;

    var counts = { newLeads: 0, dueToday: 0, overdue: 0, converted: 0 };
    var dueNames = [];
    var overdueNames = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[10] || '') !== rep.name) continue;

      var status = String(row[9] || 'New');
      if (status === 'New') counts.newLeads++;
      if (status === 'Converted') { counts.converted++; continue; }
      if (status === 'Lost' || status === 'Do Not Contact') continue;

      var followUp = row[12];
      if (!(followUp instanceof Date) || isNaN(followUp.getTime())) continue;
      var dueDate = new Date(followUp.getFullYear(), followUp.getMonth(), followUp.getDate());
      var leadName = String(row[2] || 'Unnamed lead');

      if (dueDate.getTime() < today.getTime()) {
        counts.overdue++;
        overdueNames.push(leadName);
      } else if (dueDate.getTime() === today.getTime()) {
        counts.dueToday++;
        dueNames.push(leadName);
      }
    }

    var list = function(names, emptyText) {
      return names.length ? '<ul><li>' + names.map(function(name) { return escapeHtmlForEmail(name); }).join('</li><li>') + '</li></ul>' : '<p>' + emptyText + '</p>';
    };
    var subject = 'IAAJ sales plan: ' + counts.newLeads + ' new · ' + counts.dueToday + ' due today · ' + counts.overdue + ' overdue';
    var html =
      '<div style="font-family:Arial,sans-serif;color:#222;max-width:560px">' +
      '<h2 style="margin-bottom:8px">Your IAAJ sales dashboard</h2>' +
      '<p>Good morning, ' + escapeHtmlForEmail(rep.name) + '. Here is your follow-up list for today.</p>' +
      '<table style="border-collapse:collapse;width:100%;margin:18px 0"><tr>' +
      metricCell('New leads', counts.newLeads, '#e8113c') +
      metricCell('Due today', counts.dueToday, '#b45309') +
      metricCell('Overdue', counts.overdue, '#b91c1c') +
      metricCell('Converted', counts.converted, '#15803d') +
      '</tr></table>' +
      '<h3>Calls due today</h3>' + list(dueNames, 'No calls are due today.') +
      '<h3>Overdue follow-ups</h3>' + list(overdueNames, 'Nothing is overdue.') +
      '<p style="margin-top:22px"><a href="https://itsallaboutjourney.com/crm" style="background:#e8113c;color:#fff;padding:12px 16px;text-decoration:none;border-radius:5px;font-weight:bold">Open CRM</a></p>' +
      '<p style="font-size:12px;color:#666">After every call, update the status and set the next follow-up date before moving on.</p>' +
      '</div>';

    MailApp.sendEmail({ to: rep.email, subject: subject, htmlBody: html });
  });
}

function metricCell(label, value, color) {
  return '<td style="border:1px solid #eee;padding:12px;text-align:center"><strong style="font-size:22px;color:' + color + '">' + value + '</strong><br><span style="font-size:11px;color:#666;text-transform:uppercase">' + label + '</span></td>';
}

function escapeHtmlForEmail(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Daily WhatsApp digest to Gaurav (replaces/supplements the weekly email -
// requested 18 Aug 2026: "daily morning message at 9AM about everything...
// number of new leads, assign to whom, what happened to yesterday's leads")
//
// WHY A TEMPLATE, NOT A PLAIN sendText LIKE THE QUALIFIED-LEAD PING: this
// runs on a time trigger, not in reply to an inbound message, so there's no
// guarantee Gaurav messaged the bot inside the last 24 hours to keep the
// free-form reply window open. A template is the only message type Meta
// delivers outside that window. Template "iaaj_daily_digest" (UTILITY,
// English) was submitted via the Graph API on 18 Aug 2026 and needs Meta's
// approval (usually minutes to a few hours) before this will actually send -
// check WhatsApp Manager > Message Templates if sendDailyWhatsAppDigest()
// logs a failure.
//
// WHY "YESTERDAY", NOT "LAST 24 HOURS FROM NOW": this runs once at 9am, so
// anchoring every count to yesterday's calendar day (not a rolling 24h
// window from whenever the trigger actually fires) keeps "new leads",
// "assigned to whom", and "what happened to them" all describing the exact
// same batch of leads, which is what makes the digest answerable at a
// glance instead of three numbers from three different time windows.
//
// Due-today/overdue are the exception - those describe the whole live
// follow-up pipeline as of this morning, not just yesterday's leads, since
// a lead from last week that's now overdue is exactly what a sales owner
// needs flagged and yesterday-only counts would hide it.

// Read from Script Properties (Apps Script editor > Project Settings >
// Script Properties), NOT hardcoded here - this file lives inside the
// website/ git repo, which is pushed to a real GitHub remote. A literal
// token in source would sit in git history forever, readable by anyone
// with repo access (or anyone who ever gets it, if visibility changes),
// with no way to fully remove it short of rewriting history. Script
// Properties keeps the same one-time-setup convenience without that risk.
// One-time setup: Project Settings (gear icon) > Script Properties > Add
// property, key DIGEST_WHATSAPP_TOKEN, value = the permanent access token.
function getDigestWhatsAppToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('DIGEST_WHATSAPP_TOKEN');
  if (!token) throw new Error('DIGEST_WHATSAPP_TOKEN not set - add it in Project Settings > Script Properties.');
  return token;
}
var DIGEST_WHATSAPP_PHONE_NUMBER_ID = '1276526092207910'; // not a secret - public-facing phone number ID
var DIGEST_GRAPH_VERSION = 'v25.0';
var GAURAV_WHATSAPP_NUMBER = '919403912211';

function setupDailyWhatsAppDigestTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyWhatsAppDigest') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sendDailyWhatsAppDigest').timeBased().everyDays(1).atHour(9).create();
  Logger.log('Daily WhatsApp digest trigger set for 9am, script timezone (Extensions > Apps Script > Project Settings to check/change it).');
}

function sendDailyWhatsAppDigest() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('All Leads') || ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();

  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  var yesterdayLeads = 0;
  var repCounts = {};
  var unassigned = 0;
  var converted = 0, lost = 0, stillOpen = 0;
  var dueToday = 0, overdue = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[2]) continue;

    var status = String(row[9] || 'New');
    var rep = String(row[10] || 'Unassigned');
    var createdDate = row[1] instanceof Date ? row[1] : null;

    if (createdDate && createdDate >= yesterdayStart && createdDate < todayStart) {
      yesterdayLeads++;
      if (!rep || rep === 'Unassigned') {
        unassigned++;
      } else {
        repCounts[rep] = (repCounts[rep] || 0) + 1;
      }
      if (status === 'Converted') converted++;
      else if (status === 'Lost' || status === 'Do Not Contact') lost++;
      else stillOpen++;
    }

    // Whole live pipeline, not just yesterday's leads - see comment above.
    if (status !== 'Converted' && status !== 'Lost' && status !== 'Do Not Contact') {
      var followUp = row[12];
      if (followUp instanceof Date && !isNaN(followUp.getTime())) {
        var dueDate = new Date(followUp.getFullYear(), followUp.getMonth(), followUp.getDate());
        if (dueDate.getTime() < todayStart.getTime()) overdue++;
        else if (dueDate.getTime() === todayStart.getTime()) dueToday++;
      }
    }
  }

  var dateLabel = Utilities.formatDate(yesterdayStart, Session.getScriptTimeZone(), 'd MMM');

  var params = [
    dateLabel,
    String(yesterdayLeads),
    String(repCounts['Sales Rep 1'] || 0),
    String(repCounts['Sales Rep 2'] || 0),
    String(unassigned),
    String(yesterdayLeads),
    String(converted),
    String(stillOpen),
    String(lost),
    String(dueToday),
    String(overdue)
  ];

  sendWhatsAppTemplate_(GAURAV_WHATSAPP_NUMBER, 'iaaj_daily_digest', 'en', params);
}

function sendWhatsAppTemplate_(to, templateName, langCode, bodyParams) {
  var url = 'https://graph.facebook.com/' + DIGEST_GRAPH_VERSION + '/' + DIGEST_WHATSAPP_PHONE_NUMBER_ID + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: langCode },
      components: [
        {
          type: 'body',
          parameters: bodyParams.map(function (p) { return { type: 'text', text: p }; })
        }
      ]
    }
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getDigestWhatsAppToken_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  if (resp.getResponseCode() >= 300) {
    Logger.log('WhatsApp digest send failed: ' + resp.getContentText());
    // Fall back to email so a delivery failure (e.g. template not approved
    // yet) doesn't mean the digest just silently never arrives anywhere.
    try {
      MailApp.sendEmail({
        to: GAURAV_EMAIL,
        subject: 'IAAJ daily WhatsApp digest failed to send',
        htmlBody: '<p>The WhatsApp send failed - check Message Templates in WhatsApp Manager for approval status. Raw response:</p><pre>' + escapeHtmlForEmail(resp.getContentText()) + '</pre>'
      });
    } catch (mailErr) {
      // last resort already exhausted - visible in Executions log at least
    }
  }
}
