// Proxy for the free-guides Apps Script. See _proxyHelpers.js for why this
// exists. Specific to this one: the guide itself is delivered by an email
// Apps Script sends after receiving this request, so a silently-failed
// write here doesn't just miss a CRM row - the visitor is told "check
// your email" and the email never comes, with no error on either end.
const { createProxy } = require('./_proxyHelpers');

module.exports = createProxy(
  'https://script.google.com/macros/s/AKfycbz--RdsdnGAq-rdt1rMjbgYwsaiqGqz2MdrzLBF--XBq6tKYCVLANe03JQdOTYHBdf-7Q/exec',
  'guides'
);
