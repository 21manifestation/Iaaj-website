// Shared tracking for all IAAJ pages. Loaded in the <head> of every page.

// ---- Google Analytics 4 ----
(function () {
  var GA_ID = 'G-ED7CTVGJYY';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);
})();

// ---- Shared event helper ----
// Safe to call before GA/Pixel finish loading: gtag queues into dataLayer,
// and fbq queues onto its own stub queue (set up below) until the real
// script loads. Fires both GA4 and the Meta Pixel from one call so event
// call sites never have to remember to do both - e.g. quiz completion
// needs to reach Meta specifically, since that's what lets a retargeting
// Custom Audience exclude people who already finished the quiz (Pixel
// only fires a generic PageView otherwise, which can't tell a bounce
// apart from a completion).
window.iaajTrack = function (name, params) {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  } catch (e) { /* tracking must never break the page */ }
  try {
    if (typeof window.fbq === 'function') window.fbq('trackCustom', name, params || {});
  } catch (e) { /* tracking must never break the page */ }
};

// ---- Floating button usage ----
// We have two floating CTAs competing for the same corner. Track which one
// women actually reach for, so the decision to keep or drop one is made on
// real numbers rather than taste.
document.addEventListener('DOMContentLoaded', function () {
  var stack = document.querySelector('.float-stack');
  if (!stack) return;

  stack.addEventListener('click', function (e) {
    var btn = e.target.closest('.float-btn');
    if (!btn) return;

    var which = btn.classList.contains('float-quiz') ? 'quiz'
              : btn.classList.contains('float-chat') ? 'chat'
              : 'unknown';

    // The chat button toggles. Its own handler runs before this one and has
    // already flipped the class, so "open" here means the click just opened it.
    // Anything else is a close, which we don't count.
    if (which === 'chat' && !btn.classList.contains('open')) return;

    window.iaajTrack('float_click', { float_action: which, page_path: location.pathname });
  });
});

// ---- Meta (Facebook) Pixel ----
// Paste the Pixel ID between the quotes once available, then it activates automatically.
(function () {
  var PIXEL_ID = '463552421180650';
  if (!PIXEL_ID) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');
})();
