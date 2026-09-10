// Proxy for the enquiry-form Apps Script (the sheet that drives nurture
// emails - separate from the Master CRM copy, which goes through
// api/crm.js). See _proxyHelpers.js for why this exists.
//
// URL rebuilt 10 Sep 2026 - same root cause as api/onboarding.js the same
// day, the previous deployment was gone (404/502 on every real request).
// New backend: IAAJ_Enquiry_Backend.gs, container-bound to the website
// leads sheet.
const { createProxy } = require('./_proxyHelpers');

module.exports = createProxy(
  'https://script.google.com/macros/s/AKfycbxczBa3a32pzGfw-UWrVfi0Re2C55hbL8WSZw46n3JyeHbX08mZfDBsoOFjrFguLgZAFw/exec',
  'enquiry'
);
