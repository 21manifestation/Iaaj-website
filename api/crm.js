// Server-side proxy for the Master Sales CRM Apps Script (read path only).
//
// Why this exists: the browser cannot reliably fetch the Apps Script /exec URL
// directly. Google 302-redirects it to script.googleusercontent.com, and that
// second request intermittently returns 404 for cross-origin browser fetches
// (it carries an Origin header and the user's Google cookies). When that
// happens the dashboard's fetch rejects and the sales team sees no leads at all.
//
// Fetching the same URL server-side behaves like curl - no Origin header, no
// Google cookies - and returns clean JSON every time. The dashboard therefore
// calls this same-origin endpoint instead, which removes CORS, the redirect and
// the cookie problem in one go.
//
// Writes (update_lead / update_settings) still POST straight to Apps Script from
// the browser using mode:'no-cors'. Those never needed to read a response, so
// they were never affected by this bug and are deliberately left alone.

const CRM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxhhkL_pBf91KHLSFaXlc8YOZR5rCgbQpSpMsQswF5e0zR9QdiVR0DkAXVoa-n9bVqS/exec';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const upstream = await fetch(CRM_ENDPOINT, { redirect: 'follow' });
    const body = await upstream.text();

    let data;
    try {
      data = JSON.parse(body);
    } catch (parseErr) {
      // Apps Script served an HTML error/login page instead of JSON.
      res.status(502).json({
        status: 'error',
        message: 'CRM backend did not return JSON (HTTP ' + upstream.status + ').'
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ status: 'error', message: 'Could not reach the CRM backend.' });
  }
};
