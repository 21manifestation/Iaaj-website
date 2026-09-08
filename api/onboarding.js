// Proxy for the client onboarding Apps Script. See _proxyHelpers.js for
// why this exists generally; this one is the highest-stakes of the five,
// since it's the highest-stakes form on the site: it carries a paying
// client's full intake (medical history, measurements, two photos) as one
// submission with no draft-save and no other record if it silently fails.
//
// Photos are already compressed client-side to ~1280px JPEGs before this
// ever runs, so the base64 payload stays well under Vercel's request body
// limit.
const { createProxy } = require('./_proxyHelpers');

module.exports = createProxy(
  'https://script.google.com/macros/s/AKfycbym0dzREDgc6IJvysBb-OyIreFi5u_X_rgA2A6gu7dl2SUzy4ocHIZv6oK_2ATz9qtzxg/exec',
  'onboarding'
);
