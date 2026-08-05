/**
 * IAAJ Master Sales CRM — Front-End Logic
 */

document.addEventListener('DOMContentLoaded', function () {
  
  // 1. CRM Backend Endpoint URL
  // Paste your Apps Script Web App URL below after deploying CRM_Backend.gs
  var CRM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxhhkL_pBf91KHLSFaXlc8YOZR5rCgbQpSpMsQswF5e0zR9QdiVR0DkAXVoa-n9bVqS/exec';

  // Security PIN Configuration — each sales rep gets their own PIN so they
  // only ever see leads assigned to them, not the whole pipeline.
  var ADMIN_PIN = '9403'; // Gaurav PIN
  var REP1_PIN = '1111';  // Sales Rep 1 PIN
  var REP2_PIN = '2222';  // Sales Rep 2 PIN

  var currentRole = sessionStorage.getItem('iaaj_crm_role') || null;
  var allLeads = [];
  var crmSettings = { distributionMode: 'MANUAL', reps: ['Gaurav', 'Sales Rep 1', 'Sales Rep 2'] };

  // DOM Elements
  var authScreen = document.getElementById('crm-auth-screen');
  var dashboardScreen = document.getElementById('crm-dashboard-screen');
  var pinForm = document.getElementById('crm-pin-form');
  var pinInput = document.getElementById('crm-pin-input');
  var pinError = document.getElementById('crm-pin-error');
  var logoutBtn = document.getElementById('crm-logout-btn');

  var roleBadge = document.getElementById('crm-role-badge');
  var userName = document.getElementById('crm-user-name');
  var adminBar = document.getElementById('crm-admin-bar');
  var modeManualBtn = document.getElementById('mode-manual-btn');
  var modeAutoBtn = document.getElementById('mode-auto-btn');
  var modeDesc = document.getElementById('crm-mode-desc');

  var statTotal = document.getElementById('stat-total-leads');
  var statNew = document.getElementById('stat-new-leads');
  var statQualified = document.getElementById('stat-qualified');
  var statFollowups = document.getElementById('stat-followups');

  var searchInput = document.getElementById('crm-search-input');
  var filterRep = document.getElementById('crm-filter-rep');
  var filterStatus = document.getElementById('crm-filter-status');
  var filterSource = document.getElementById('crm-filter-source');
  var refreshBtn = document.getElementById('crm-refresh-btn');

  var leadsGrid = document.getElementById('crm-leads-grid');
  var leadCountEl = document.getElementById('crm-lead-count');

  // --- 2. AUTHENTICATION LOGIC ---
  if (currentRole) {
    showDashboard(currentRole);
  }

  if (pinForm) {
    pinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = pinInput.value.trim();
      if (pin === ADMIN_PIN) {
        currentRole = 'ADMIN';
        sessionStorage.setItem('iaaj_crm_role', 'ADMIN');
        showDashboard('ADMIN');
      } else if (pin === REP1_PIN) {
        currentRole = 'Sales Rep 1';
        sessionStorage.setItem('iaaj_crm_role', 'Sales Rep 1');
        showDashboard('Sales Rep 1');
      } else if (pin === REP2_PIN) {
        currentRole = 'Sales Rep 2';
        sessionStorage.setItem('iaaj_crm_role', 'Sales Rep 2');
        showDashboard('Sales Rep 2');
      } else {
        pinError.style.display = 'block';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      sessionStorage.removeItem('iaaj_crm_role');
      currentRole = null;
      dashboardScreen.style.display = 'none';
      authScreen.style.display = 'flex';
      pinInput.value = '';
      if (pinError) pinError.style.display = 'none';
    });
  }

  function showDashboard(role) {
    authScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';

    if (role === 'ADMIN') {
      roleBadge.textContent = 'Admin: Gaurav';
      roleBadge.className = 'crm-badge crm-badge-admin';
      userName.textContent = 'Welcome, Gaurav (Admin)';
      adminBar.style.display = 'flex';
      if (filterRep) filterRep.style.display = '';
    } else {
      roleBadge.textContent = role;
      roleBadge.className = 'crm-badge crm-badge-sales';
      userName.textContent = 'Welcome, ' + role;
      adminBar.style.display = 'none';
      // Reps only ever see their own leads, so the "assigned rep" filter is
      // meaningless (and picking another rep would just show zero results).
      if (filterRep) filterRep.style.display = 'none';
    }

    fetchLeads();
  }

  // --- 3. FETCH LEADS & SETTINGS ---
  function fetchLeads() {
    leadsGrid.innerHTML = '<div class="crm-loading-state">Loading Master CRM Leads...</div>';

    if (!CRM_ENDPOINT || CRM_ENDPOINT.indexOf('script.google.com') === -1) {
      showLoadError();
      return;
    }

    // Never serve an old browser-cached snapshot to the sales team. A fresh
    // timestamp also makes it clear whether the live Apps Script is reachable.
    var endpointUrl = CRM_ENDPOINT + (CRM_ENDPOINT.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
    fetch(endpointUrl, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.leads) {
          allLeads = data.leads;
          if (data.settings) {
            crmSettings = data.settings;
            updateDistributionUI(crmSettings.distributionMode);
          }
          renderDashboard();
        } else {
          showLoadError();
        }
      })
      .catch(function () {
        showLoadError();
      });
  }

  function showLoadError() {
    // Showing fake records is worse than showing an error: it makes a live
    // CRM problem look like each salesperson has only one real lead.
    allLeads = [];
    updateMetrics();
    leadCountEl.textContent = '0';
    leadsGrid.innerHTML =
      '<div class="crm-loading-state">Could not load live leads. Please click Refresh Leads. No sample data is shown.</div>';
  }

  // --- 4. RENDER DASHBOARD & METRICS ---
  // Reps only ever see their own assigned leads. Admin sees everything.
  function getVisibleLeads() {
    if (currentRole === 'ADMIN') return allLeads;
    return allLeads.filter(function (l) { return l.assignedRep === currentRole; });
  }

  function renderDashboard() {
    updateMetrics();
    renderLeadCards();
  }

  function updateMetrics() {
    var visible = getVisibleLeads();
    statTotal.textContent = visible.length;

    var newCount = visible.filter(function (l) { return l.status === 'New'; }).length;
    statNew.textContent = newCount;

    var qualCount = visible.filter(function (l) { return l.qualification === 'QUALIFIED'; }).length;
    statQualified.textContent = qualCount;

    var followCount = visible.filter(function (l) { return l.status === 'Follow-up' || l.nextFollowUp; }).length;
    statFollowups.textContent = followCount;
  }

  function renderLeadCards() {
    var search = searchInput.value.toLowerCase().trim();
    var repVal = filterRep.value;
    var statusVal = filterStatus.value;
    var sourceVal = filterSource.value;

    var filtered = getVisibleLeads().filter(function (l) {
      var matchesSearch = !search ||
        (l.name && l.name.toLowerCase().indexOf(search) > -1) ||
        (l.phone && String(l.phone).indexOf(search) > -1) ||
        (l.email && l.email.toLowerCase().indexOf(search) > -1) ||
        (l.condition && l.condition.toLowerCase().indexOf(search) > -1);

      var matchesRep = repVal === 'ALL' || l.assignedRep === repVal;
      var matchesStatus = statusVal === 'ALL' || l.status === statusVal;
      var matchesSource = sourceVal === 'ALL' || l.source === sourceVal;

      return matchesSearch && matchesRep && matchesStatus && matchesSource;
    });

    leadCountEl.textContent = filtered.length;

    if (filtered.length === 0) {
      leadsGrid.innerHTML = '<div class="crm-loading-state">No matching leads found.</div>';
      return;
    }

    var html = '';
    filtered.forEach(function (lead) {
      var dateStr = lead.date ? new Date(lead.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '';
      var statusClass = 'status-' + (lead.status || 'new').toLowerCase().replace(/\s+/g, '-');
      var waUrl = generateWhatsAppUrl(lead);

      html += `
        <div class="crm-lead-card ${statusClass}" data-id="${lead.leadId}">
          <div class="crm-lead-header">
            <div>
              <h4 class="crm-lead-name">${escapeHtml(lead.name || 'Unnamed Lead')}</h4>
              <div class="crm-lead-meta">${lead.leadId} · ${dateStr}</div>
            </div>
            <div class="crm-lead-tag-group">
              <span class="crm-tag ${lead.qualification === 'QUALIFIED' ? 'crm-tag-qual' : 'crm-tag-unqual'}">
                ${escapeHtml(lead.qualification || 'Standard')}
              </span>
            </div>
          </div>

          <div class="crm-lead-details">
            <div class="crm-detail-item"><strong>📞 Phone:</strong> ${escapeHtml(lead.phone || 'N/A')}</div>
            <div class="crm-detail-item"><strong>📍 City/Cond:</strong> ${escapeHtml(lead.city || 'N/A')} · ${escapeHtml(lead.condition || 'General')}</div>
            <div class="crm-detail-item"><strong>📌 Source:</strong> ${escapeHtml(lead.source || 'Website')}</div>
          </div>

          <!-- Tap-to-WhatsApp CTA -->
          <a href="${waUrl}" target="_blank" class="crm-wa-btn">
            💬 Chat on WhatsApp
          </a>

          <!-- Quick Actions & Status -->
          <div class="crm-card-actions">
            <div>
              <label class="crm-field-label">Status</label>
              <select class="crm-select-sm card-status-select">
                <option value="New" ${lead.status === 'New' ? 'selected' : ''}>New</option>
                <option value="Contacted" ${lead.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
                <option value="Follow-up" ${lead.status === 'Follow-up' ? 'selected' : ''}>Follow-up</option>
                <option value="Converted" ${lead.status === 'Converted' ? 'selected' : ''}>Converted</option>
                <option value="Lost" ${lead.status === 'Lost' ? 'selected' : ''}>Lost</option>
              </select>
            </div>

            <div>
              <label class="crm-field-label">Assigned Rep</label>
              <select class="crm-select-sm card-rep-select">
                <option value="Unassigned" ${lead.assignedRep === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
                <option value="Gaurav" ${lead.assignedRep === 'Gaurav' ? 'selected' : ''}>Gaurav</option>
                <option value="Sales Rep 1" ${lead.assignedRep === 'Sales Rep 1' ? 'selected' : ''}>Sales Rep 1</option>
                <option value="Sales Rep 2" ${lead.assignedRep === 'Sales Rep 2' ? 'selected' : ''}>Sales Rep 2</option>
              </select>
            </div>

            <textarea class="crm-notes-textarea card-notes-input" placeholder="Add sales note or objection detail...">${escapeHtml(lead.notes || '')}</textarea>
          </div>

          <div class="crm-card-footer">
            <span class="crm-subtext">Click save after edits</span>
            <button class="crm-save-lead-btn" onclick="saveLeadEdit('${lead.leadId}', this)">Save Changes</button>
          </div>
        </div>
      `;
    });

    leadsGrid.innerHTML = html;
  }

  // --- 5. TAP-TO-WHATSAPP MESSAGE GENERATOR ---
  function generateWhatsAppUrl(lead) {
    var rawPhone = String(lead.phone || '').replace(/\D/g, '');
    if (!rawPhone) return 'https://wa.me/919403912211';

    if (rawPhone.length === 10) rawPhone = '91' + rawPhone;

    var firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    var text = '';

    if (lead.source === 'Website Enquiry') {
      text = `Hey ${firstName}! Gaurav here from It's All About Journey 💛 Saw your enquiry about our 90-day ${lead.condition || 'PCOS'} Habit Reset program. Ready to walk through your hormonal type and what plan suits your body best?`;
    } else if (lead.source === 'Free Guide') {
      text = `Hey ${firstName}! Gaurav here from It's All About Journey 💛 Saw you requested our free hormonal health guides (${lead.condition || 'PCOS'}). Have you had a chance to look through them?`;
    } else if (lead.source === 'Hormonal Quiz' || lead.source === 'Quiz') {
      text = `Hey ${firstName}! Gaurav here from It's All About Journey 💛 Saw you completed our 2-minute hormonal type quiz! Would love to walk you through your result and how we fix this in 90 days.`;
    } else {
      text = `Hey ${firstName}! Gaurav here from It's All About Journey 💛 Saw your message regarding ${lead.condition || 'hormonal fat loss'}. How can I help you today?`;
    }

    return 'https://wa.me/' + rawPhone + '?text=' + encodeURIComponent(text);
  }

  // --- 6. SAVE LEAD CHANGES ---
  window.saveLeadEdit = function (leadId, btnEl) {
    var card = btnEl.closest('.crm-lead-card');
    var newStatus = card.querySelector('.card-status-select').value;
    var newRep = card.querySelector('.card-rep-select').value;
    var newNotes = card.querySelector('.card-notes-input').value;

    btnEl.textContent = 'Saving...';
    btnEl.disabled = true;

    // Local update
    for (var i = 0; i < allLeads.length; i++) {
      if (allLeads[i].leadId === leadId) {
        allLeads[i].status = newStatus;
        allLeads[i].assignedRep = newRep;
        allLeads[i].notes = newNotes;
        break;
      }
    }

    if (CRM_ENDPOINT && CRM_ENDPOINT.indexOf('script.google.com') > -1) {
      var body = new URLSearchParams({
        action: 'update_lead',
        leadId: leadId,
        status: newStatus,
        assignedRep: newRep,
        notes: newNotes
      });
      fetch(CRM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body })
        .then(function () {
          btnEl.textContent = 'Saved!';
          setTimeout(function () {
            btnEl.textContent = 'Save Changes';
            btnEl.disabled = false;
            renderDashboard();
          }, 1000);
        })
        .catch(function () {
          btnEl.textContent = 'Saved Locally!';
          setTimeout(function () { btnEl.textContent = 'Save Changes'; btnEl.disabled = false; }, 1000);
        });
    } else {
      btnEl.textContent = 'Saved!';
      setTimeout(function () {
        btnEl.textContent = 'Save Changes';
        btnEl.disabled = false;
        renderDashboard();
      }, 800);
    }
  };

  // --- 7. ADMIN CONTROLS (DISTRIBUTION MODE) ---
  if (modeManualBtn && modeAutoBtn) {
    modeManualBtn.addEventListener('click', function () { updateDistributionMode('MANUAL'); });
    modeAutoBtn.addEventListener('click', function () { updateDistributionMode('ROUND_ROBIN'); });
  }

  function updateDistributionMode(mode) {
    crmSettings.distributionMode = mode;
    updateDistributionUI(mode);

    if (CRM_ENDPOINT && CRM_ENDPOINT.indexOf('script.google.com') > -1) {
      var body = new URLSearchParams({ action: 'update_settings', distributionMode: mode });
      fetch(CRM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
    }
  }

  function updateDistributionUI(mode) {
    if (mode === 'ROUND_ROBIN') {
      modeAutoBtn.classList.add('active');
      modeManualBtn.classList.remove('active');
      modeDesc.innerHTML = 'Incoming leads are <strong>automatically distributed (Round-Robin)</strong> between Sales Rep 1 & Sales Rep 2.';
    } else {
      modeManualBtn.classList.add('active');
      modeAutoBtn.classList.remove('active');
      modeDesc.innerHTML = 'New leads land as <em>Unassigned</em> for Gaurav to manually distribute.';
    }
  }

  // --- 8. FILTERS & SEARCH LISTENERS ---
  if (searchInput) searchInput.addEventListener('input', renderLeadCards);
  if (filterRep) filterRep.addEventListener('change', renderLeadCards);
  if (filterStatus) filterStatus.addEventListener('change', renderLeadCards);
  if (filterSource) filterSource.addEventListener('change', renderLeadCards);
  if (refreshBtn) refreshBtn.addEventListener('click', fetchLeads);

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
