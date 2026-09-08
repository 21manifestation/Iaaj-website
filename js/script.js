// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  // Inline coaching CTAs still go to the application form, because the form
  // captures things WhatsApp's qualification flow doesn't ask for (email,
  // city, goal in their own words) and those CTAs sit on high-intent pages
  // where that detail is worth the extra friction.
  //
  // The floating button is the exception and is now left alone. It used to be
  // removed outright, because back then a WhatsApp chat landed in a personal
  // inbox the CRM never saw - so every tap was a lead leaking out of the
  // funnel. That is no longer true: the number is on the Cloud API and
  // api/whatsapp-webhook.js qualifies the person, logs them to the same CRM
  // sheet the form feeds, and round-robins them to a rep. With the leak
  // closed, the argument for hiding the lowest-friction entry point on the
  // site went with it.
  var isLeadMagnetPage = /\/(guides|quiz)(?:\.html)?$/.test(location.pathname);
  document.querySelectorAll('a[href*="wa.me/"]').forEach(function (link) {
    var isGuideCompletionLink = isLeadMagnetPage && !!link.closest('#guides-download');
    if (isGuideCompletionLink) return;
    if (link.classList.contains('float-wa')) return;
    link.href = '/contact';
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.textContent = 'Apply for coaching';
    link.setAttribute('aria-label', 'Apply for coaching');
  });

  var toggle = document.querySelector('.nav-toggle');
  var menu = document.querySelector('.mobile-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      menu.classList.toggle('open');
    });
  }

  // Fade sections in as they scroll into view (skip the hero, it's visible on load).
  // Repeated items inside a section (cards, pillars, gallery images) come in one
  // after another instead of together, which reads calmer than a single big jump.
  var STAGGER_STEP_MS = 80;
  var STAGGER_MAX_MS = 480;
  var STAGGER_SELECTOR = '.card, .pillar-card, .article-card, .step-card, .faq-item, .proof-strip img, .transformation-gallery img';

  var revealTargets = document.querySelectorAll('section:not(.hero)');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        entry.target.querySelectorAll('.reveal-child').forEach(function (child) {
          child.classList.add('in-view');
        });
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12 });

    revealTargets.forEach(function (el) {
      el.classList.add('reveal');

      // Only stagger when there are several siblings, otherwise a lone card
      // just looks like it lagged behind the heading.
      var children = el.querySelectorAll(STAGGER_SELECTOR);
      if (children.length > 1) {
        children.forEach(function (child, i) {
          child.classList.add('reveal-child');
          child.style.setProperty('--reveal-delay', Math.min(i * STAGGER_STEP_MS, STAGGER_MAX_MS) + 'ms');
        });
      }

      revealObserver.observe(el);
    });
  }

  // BLESS method: highlight the pillar the reader is currently level with, and
  // mirror it in the sticky track alongside. Purely decorative, so if anything
  // here is unsupported the pillars still read fine as a plain stacked list.
  var blessSteps = document.querySelectorAll('.bless-step');
  if (blessSteps.length && 'IntersectionObserver' in window) {
    var blessMarks = document.querySelectorAll('.bless-track li');

    var setActiveStep = function (index) {
      blessSteps.forEach(function (s) { s.classList.toggle('active', +s.dataset.step === index); });
      blessMarks.forEach(function (m) { m.classList.toggle('active', +m.dataset.step === index); });
    };

    var blessObserver = new IntersectionObserver(function (entries) {
      // Pick the entry closest to the middle of the viewport so the highlight
      // doesn't flicker when two cards are on screen together.
      var best = null;
      entries.forEach(function (entry) { if (entry.isIntersecting) best = entry; });
      if (best) setActiveStep(+best.target.dataset.step);
    }, { rootMargin: '-45% 0px -45% 0px' });

    blessSteps.forEach(function (step) { blessObserver.observe(step); });
    setActiveStep(0);
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
  // Submits through /api/guides (see that file for the actual Apps Script
  // URL) rather than fetching Apps Script directly from here.
  var GUIDES = {
    protein:   { name: 'Protein Guide',               file: 'guides/iaaj-protein-guide.pdf' },
    hydration: { name: 'Hydration Guide',             file: 'guides/iaaj-hydration-guide.pdf' },
    sleep:     { name: 'Sleep Guide',                 file: 'guides/iaaj-sleep-guide.pdf' },
    hormonal:  { name: 'PCOS & Hormonal Guide',       file: 'guides/iaaj-hormonal-guide.pdf' },
    insulin:   { name: 'Insulin & Blood Sugar Guide', file: 'guides/iaaj-insulin-guide.pdf' },
    alcohol:   { name: 'Alcohol Guide',               file: 'guides/iaaj-alcohol-guide.pdf' },
    stress:    { name: 'Stress & Cortisol Guide',     file: 'guides/iaaj-stress-cortisol-guide.pdf' },
    cravings:  { name: 'Cravings Guide',              file: 'guides/iaaj-cravings-guide.pdf' },
    plateaus:  { name: 'Plateaus Guide',               file: 'guides/iaaj-plateaus-guide.pdf' },
    cheatmeals:{ name: 'Cheat Meals Guide',            file: 'guides/iaaj-cheat-meals-guide.pdf' },
    eatingout: { name: 'Eating Out Guide',             file: 'guides/iaaj-eating-out-guide.pdf' },
    mindset:   { name: 'Mindset & Self-Sabotage Guide', file: 'guides/iaaj-mindset-guide.pdf' }
  };

  var guidesForm = document.querySelector('#guides-form');
  if (guidesForm) {
    var guideBoxes = guidesForm.querySelectorAll('input[name="guides"]');
    var guideError = guidesForm.querySelector('#g-guide-error');
    // Captured once so the "pick a guide" message can be restored after the
    // network-failure branch below reuses this same element for its own
    // text - without this, one failed submission would permanently replace
    // the validation message for the rest of the page's life.
    var guideErrorDefaultText = guideError ? guideError.textContent : '';

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
        if (guideError) {
          guideError.textContent = guideErrorDefaultText;
          guideError.style.display = 'block';
        }
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

      // Through the same-origin /api/guides proxy, not mode:'no-cors'
      // direct to Apps Script. The guide is delivered by an email Apps
      // Script sends after receiving this - a silently-failed write here
      // used to mean the page said "check your email" and the email never
      // came, with no error anywhere to explain why. The proxy retries
      // once, and a genuine failure keeps the form up with an error
      // instead of showing the download screen for nothing.
      var body = new URLSearchParams(payload);
      fetch('/api/guides', { method: 'POST', body: body })
        .then(function (res) { return res.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data || data.status !== 'success') throw new Error('guides save failed');

          // Confirm on-page which email the guides were sent to.
          var sentTo = document.querySelector('#sent-to-email');
          if (sentTo) sentTo.textContent = payload.email;

          guidesForm.style.display = 'none';
          document.querySelector('#guides-download').style.display = 'block';
        })
        .catch(function () {
          if (guideError) {
            guideError.textContent = 'Something went wrong sending your guide. Please try again, or message us on WhatsApp.';
            guideError.style.display = 'block';
          }
        });
    });
  }

  // Enquiry form: qualify the lead on the page first, then log to two
  // places - /api/enquiry (drives the nurture emails) and /api/crm (the
  // sales team's Master CRM, alongside their Instagram/Superreply leads).
  // Both proxies, both additive copies of the same submission. Sales reps
  // call qualified applicants directly.

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
      // Through /api/enquiry, not mode:'no-cors' direct - same reasoning as
      // the Master CRM copy just below: no-cors made a failed write here
      // indistinguishable from a successful one.
      var body = new URLSearchParams({
        name: val('name'),
        email: val('email'),
        phone: val('whatsapp'),
        city: val('condition'),
        guides: val('struggle'),
        page: 'Enquiry — ' + (qualified ? 'QUALIFIED' : 'not qualified') +
              ' (start: ' + timeline + ', invest: ' + invest + ')'
      });
      fetch('/api/enquiry', { method: 'POST', body: body })
        .then(function (res) { return res.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data || data.status !== 'success') console.error('Enquiry did not reach the nurture-email sheet', data);
        })
        .catch(function (err) {
          console.error('Enquiry did not reach the nurture-email sheet', err);
        });

      // Copy into the Master Sales CRM, using its own field names (condition + qualification
      // are native columns there, distinct from "city" which we don't collect on this form).
      {
        var crmBody = new URLSearchParams({
          name: val('name'),
          email: val('email'),
          phone: val('whatsapp'),
          condition: val('condition'),
          qualification: qualified ? 'QUALIFIED' : 'High Intent',
          source: 'Website Enquiry',
          notes: val('struggle') + ' (start: ' + timeline + ', invest: ' + invest + ')'
        });
        // Through the same-origin /api/crm proxy, NOT mode:'no-cors' direct
        // to Apps Script. This is the front door of the business: the code
        // below shows the visitor a success screen immediately without
        // waiting, so a write that failed here used to lose the enquiry
        // outright - no lead in the CRM, no error, and a visitor who
        // believes they have been contacted. The proxy retries server-side
        // and, if it still fails, at least records it in the function logs
        // instead of the failure evaporating in the browser.
        fetch('/api/crm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: crmBody
        })
          .then(function (res) { return res.json().catch(function () { return null; }); })
          .then(function (data) {
            if (!data || data.status !== 'success') {
              console.error('Enquiry did not reach the CRM', data);
            }
          })
          .catch(function (err) {
            console.error('Enquiry did not reach the CRM', err);
          });
      }

      if (qualified) {
        form.style.display = 'none';
        document.querySelector('#form-success').style.display = 'block';
      } else {
        // Not ready to commit: nurture with the free guides instead of a cold sales lead.
        form.style.display = 'none';
        document.querySelector('#form-nurture').style.display = 'block';
      }
    });
  }
});
