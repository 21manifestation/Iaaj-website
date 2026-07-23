// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.querySelector('.mobile-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      menu.classList.toggle('open');
    });
  }

  // Fade sections in as they scroll into view (skip the hero, it's visible on load).
  var revealTargets = document.querySelectorAll('section:not(.hero)');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealTargets.forEach(function (el) {
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }

  // Subtle shadow under the sticky header once the page starts scrolling.
  var header = document.querySelector('.site-header');
  if (header) {
    var onHeaderScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    onHeaderScroll();
    window.addEventListener('scroll', onHeaderScroll, { passive: true });
  }

  // ---- Free guides lead magnet ----
  // Data is sent to a Google Apps Script Web App, which appends it to a Google Sheet.
  // Paste the deployment URL from Apps Script between the quotes below. Until then,
  // downloads still work but submissions are not saved anywhere.
  var GUIDES_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxTYPEbIJola1EQvOuS-48sKXYirfHTcorLaQjkptorl_YSMIYt6TljSVApCa-XwGtcfg/exec';

  var GUIDES = {
    protein:   { name: 'Protein Guide',               file: 'guides/iaaj-protein-guide.pdf' },
    hydration: { name: 'Hydration Guide',             file: 'guides/iaaj-hydration-guide.pdf' },
    sleep:     { name: 'Sleep Guide',                 file: 'guides/iaaj-sleep-guide.pdf' },
    hormonal:  { name: 'PCOS & Hormonal Guide',       file: 'guides/iaaj-hormonal-guide.pdf' },
    insulin:   { name: 'Insulin & Blood Sugar Guide', file: 'guides/iaaj-insulin-guide.pdf' },
    alcohol:   { name: 'Alcohol Guide',               file: 'guides/iaaj-alcohol-guide.pdf' },
    stress:    { name: 'Stress & Cortisol Guide',     file: 'guides/iaaj-stress-cortisol-guide.pdf' },
    cravings:  { name: 'Cravings Guide',              file: 'guides/iaaj-cravings-guide.pdf' },
    plateaus:  { name: 'Plateaus Guide',               file: 'guides/iaaj-plateaus-guide.pdf' }
  };

  var guidesForm = document.querySelector('#guides-form');
  if (guidesForm) {
    var guideBoxes = guidesForm.querySelectorAll('input[name="guides"]');
    var guideError = guidesForm.querySelector('#g-guide-error');

    // Highlight the card when its checkbox is ticked.
    function refreshCards() {
      guideBoxes.forEach(function (box) {
        box.closest('.guide-check').classList.toggle('checked', box.checked);
      });
    }

    guideBoxes.forEach(function (box) {
      box.addEventListener('change', function () {
        if (guideError) guideError.style.display = 'none';
        refreshCards();
      });
    });

    guidesForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var selected = Array.prototype.filter.call(guideBoxes, function (b) { return b.checked; })
        .map(function (b) { return b.value; });

      if (selected.length === 0) {
        if (guideError) guideError.style.display = 'block';
        return;
      }

      var payload = {
        name: guidesForm.querySelector('#g-name').value.trim(),
        email: guidesForm.querySelector('#g-email').value.trim(),
        phone: guidesForm.querySelector('#g-phone').value.trim(),
        city: guidesForm.querySelector('#g-city').value.trim(),
        guides: selected.map(function (k) { return GUIDES[k].name; }).join(', '),
        keys: selected.join(', '),
        page: 'Free guides'
      };

      // Send to the Google Sheet if the endpoint is configured. Apps Script
      // needs no-cors, so we cannot read the response, we just fire it.
      if (GUIDES_ENDPOINT && GUIDES_ENDPOINT.indexOf('YOUR_APPS_SCRIPT_URL') === -1) {
        var body = new URLSearchParams(payload);
        fetch(GUIDES_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
      }

      // Guides are delivered by email (the Apps Script sends them). Confirm on-page.
      var sentTo = document.querySelector('#sent-to-email');
      if (sentTo) sentTo.textContent = payload.email;

      guidesForm.style.display = 'none';
      document.querySelector('#guides-download').style.display = 'block';
    });
  }

  // Enquiry form: qualify the lead on the page first. Every submission is logged to the
  // Google Sheet with a qualified flag. Only qualified leads are handed to WhatsApp, so cold
  // leads never land in the chats. Unqualified visitors are pointed to the free guides instead.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwpUHmEvN8SwbZ9RBZL8osYQSYzmOjEHQFIN6RIhXtwr_rY5LiqUi-p4tp6L1VagbhHSw/exec';

  var form = document.querySelector('#enquiry-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      var timeline = val('timeline');
      var invest = val('invest');
      var qualified = (timeline === 'Ready now' || timeline === 'Within a month') && invest === 'Ready';

      // Log every enquiry to the sheet. Fields map to the existing Apps Script columns:
      // phone=WhatsApp, city=Condition, guides=Struggle, page=Source + qualification status.
      if (ENQUIRY_ENDPOINT.indexOf('script.google.com') !== -1) {
        var body = new URLSearchParams({
          name: val('name'),
          email: val('email'),
          phone: val('whatsapp'),
          city: val('condition'),
          guides: val('struggle'),
          page: 'Enquiry — ' + (qualified ? 'QUALIFIED' : 'not qualified') +
                ' (start: ' + timeline + ', invest: ' + invest + ')'
        });
        fetch(ENQUIRY_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
      }

      if (qualified) {
        var msg =
          "Hi, I'd like to enquire about IAAJ coaching.\n\n" +
          'Name: ' + val('name') + '\n' +
          'Email: ' + val('email') + '\n' +
          'WhatsApp: ' + val('whatsapp') + '\n' +
          'Dealing with: ' + val('condition') + '\n' +
          'Looking to start: ' + timeline + '\n' +
          'My struggle: ' + (val('struggle') || 'Not specified');
        window.open('https://wa.me/919403912211?text=' + encodeURIComponent(msg), '_blank');
        form.style.display = 'none';
        document.querySelector('#form-success').style.display = 'block';
      } else {
        // Not ready to commit: nurture with the free guides instead of a cold WhatsApp lead.
        form.style.display = 'none';
        document.querySelector('#form-nurture').style.display = 'block';
      }
    });
  }
});
