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
    
    var distributionMode = settingsSheet.getRange('B1').getValue() || 'MANUAL';
    var assignedRep = 'Unassigned';
    
    if (distributionMode === 'ROUND_ROBIN') {
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
      'New',
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
      if (status === 'Lost') continue;

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
