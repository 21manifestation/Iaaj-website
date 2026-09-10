// Proxy for the client onboarding Apps Script. See _proxyHelpers.js for
// why this exists generally; this one is the highest-stakes of the five,
// since it carries a paying client's full intake (medical history,
// measurements, two photos) as one submission with no draft-save and no
// other record if it silently fails.
//
// Photos are already compressed client-side to ~1280px JPEGs before this
// ever runs, so the base64 payload stays well under Vercel's request body
// limit.
//
// URL rebuilt 10 Sep 2026 - the previous deployment was accidentally
// deleted during an Apps Script project cleanup, which 404'd every real
// submission silently (or with an error, after the retry/reporting fix
// shipped earlier the same week) until a client's failed screenshot
// caught it. New backend: IAAJ_Onboarding_Backend.gs, container-bound to
// the same responses spreadsheet - historical rows untouched.
const { createProxy } = require('./_proxyHelpers');

module.exports = createProxy(
  'https://script.google.com/macros/s/AKfycbytkmkkQxdzQ9FOPXgh1uAnPy-DkLKtq3SO_d0hR-ftE1e2JJrD3A2LKR5Z5sGCTOO9yw/exec',
  'onboarding'
);
