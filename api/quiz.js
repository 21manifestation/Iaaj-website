// Proxy for the hormonal-quiz Apps Script. See _proxyHelpers.js for why
// this exists.
const { createProxy } = require('./_proxyHelpers');

module.exports = createProxy(
  'https://script.google.com/macros/s/AKfycbx5WDsVj1hD-PFXoDZHdz_Poqw2dxOVTmkLYV-mxRdRj5K2Z6WPfUmawtXCjIFcW6l_/exec',
  'quiz'
);
