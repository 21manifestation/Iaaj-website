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
  var GUIDES_ENDPOINT = 'YOUR_APPS_SCRIPT_URL';

  var GUIDES = {
    protein:   { name: 'Protein Guide',          file: 'guides/iaaj-protein-guide.pdf' },
    hydration: { name: 'Hydration Guide',        file: 'guides/iaaj-hydration-guide.pdf' },
    sleep:     { name: 'Sleep Guide',            file: 'guides/iaaj-sleep-guide.pdf' },
    hormonal:  { name: 'PCOS & Hormonal Guide',  file: 'guides/iaaj-hormonal-guide.pdf' }
  };

  var guidesForm = document.querySelector('#guides-form');
  if (guidesForm) {
    var guideBoxes = guidesForm.querySelectorAll('input[name="guides"]');
    var allBox = guidesForm.querySelector('#g-all');
    var guideError = guidesForm.querySelector('#g-guide-error');

    // Highlight the card when its checkbox is ticked, and keep "all" in sync.
    function refreshCards() {
      guideBoxes.forEach(function (box) {
        box.closest('.guide-check').classList.toggle('checked', box.checked);
      });
      var everyChecked = Array.prototype.every.call(guideBoxes, function (b) { return b.checked; });
      allBox.checked = everyChecked;
      allBox.closest('.guide-check').classList.toggle('checked', everyChecked);
    }

    allBox.addEventListener('change', function () {
      guideBoxes.forEach(function (box) { box.checked = allBox.checked; });
      refreshCards();
    });
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
        page: 'Free guides'
      };

      // Send to the Google Sheet if the endpoint is configured. Apps Script
      // needs no-cors, so we cannot read the response, we just fire it.
      if (GUIDES_ENDPOINT && GUIDES_ENDPOINT.indexOf('YOUR_APPS_SCRIPT_URL') === -1) {
        var body = new URLSearchParams(payload);
        fetch(GUIDES_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
      }

      // Build the download list for exactly what they picked, then reveal it.
      var list = document.querySelector('#download-list');
      list.innerHTML = '';
      selected.forEach(function (key) {
        var g = GUIDES[key];
        var a = document.createElement('a');
        a.href = g.file;
        a.setAttribute('download', '');
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        a.innerHTML = '<span>' + g.name + '</span><span class="dl-arrow">Download &darr;</span>';
        list.appendChild(a);
      });

      guidesForm.style.display = 'none';
      document.querySelector('#guides-download').style.display = 'block';
    });
  }

  // Enquiry form: show a friendly success message without leaving the page.
  // Works once the form's "action" is set to a real Formspree endpoint (see contact.html comments).
  // Enquiry form: hand the lead straight to WhatsApp with all the details pre-filled.
  // The visitor taps send, and the enquiry lands in the IAAJ WhatsApp chats.
  var form = document.querySelector('#enquiry-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      var msg =
        "Hi, I'd like to enquire about IAAJ coaching.\n\n" +
        'Name: ' + val('name') + '\n' +
        'Email: ' + val('email') + '\n' +
        'WhatsApp: ' + val('whatsapp') + '\n' +
        'Dealing with: ' + val('condition') + '\n' +
        'My struggle: ' + (val('struggle') || 'Not specified');

      window.open('https://wa.me/919403912211?text=' + encodeURIComponent(msg), '_blank');

      form.reset();
      document.querySelector('#form-success').style.display = 'block';
      form.style.display = 'none';
    });
  }
});
