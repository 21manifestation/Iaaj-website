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
    
    sheet.appendRow([
      leadId,
      now,
      p.name || '',
      p.phone || p.whatsapp || '',
      p.email || '',
      p.city || '',
      sourceStr,
      p.condition || p.city || 'PCOS/Thyroid',
      p.qualification || (sourceStr.indexOf('QUALIFIED') > -1 ? 'QUALIFIED' : 'High Intent'),
      'New',
      assignedRep,
      '', // Last Contacted
      '', // Next Follow-up
      p.notes || p.guides || ''
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', leadId: leadId, assignedRep: assignedRep }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
