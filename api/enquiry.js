// Proxy for the enquiry-form Apps Script (the sheet that drives nurture
// emails - separate from the Master CRM copy, which goes through
// api/crm.js). See _proxyHelpers.js for why this exists.
const { createProxy } = require('./_proxyHelpers');

module.exports = createProxy(
  'https://script.google.com/macros/s/AKfycbwpUHmEvN8SwbZ9RBZL8osYQSYzmOjEHQFIN6RIhXtwr_rY5LiqUi-p4tp6L1VagbhHSw/exec',
  'enquiry'
);
