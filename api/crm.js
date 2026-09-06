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
// Writes (update_lead / update_settings) go through here too, as of Sep 2026.
//
// They used to POST straight to Apps Script from the browser with
// mode:'no-cors'. The note that they "never needed to read a response" was
// wrong in a way that cost real data: with no-cors the browser hands back an
// OPAQUE response, so fetch RESOLVES even when Apps Script returned a 500 or
// timed out on its lock. The dashboard's .then() therefore fired on failure
// exactly as it does on success, printed "Saved!", and the rep walked away
// believing the update stuck. It only surfaced on a later refresh, as a
// change that had quietly reverted. Routing writes through this same-origin
// proxy makes the response readable, so a failed save can actually say so.

const CRM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxhhkL_pBf91KHLSFaXlc8YOZR5rCgbQpSpMsQswF5e0zR9QdiVR0DkAXVoa-n9bVqS/exec';

function toFormBody(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  return new URLSearchParams(body).toString();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const isWrite = req.method === 'POST';

  try {
    // Writes get one retry. The browser reaching this same-origin function
    // is very reliable; the fragile hop is this one, into Apps Script,
    // where a lock timeout under load is the known failure mode. Retrying
    // server-side means a visitor's enquiry survives a blip without them
    // waiting on it or ever seeing an error.
    const attempts = isWrite ? 2 : 1;
    let upstream = null;
    let body = '';

    for (let i = 0; i < attempts; i++) {
      upstream = isWrite
        ? await fetch(CRM_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: toFormBody(req.body),
            redirect: 'follow'
          })
        : await fetch(CRM_ENDPOINT, { redirect: 'follow' });

      body = await upstream.text();
      if (upstream.ok && body.indexOf('"status":"error"') === -1) break;
      if (i < attempts - 1) await new Promise(function (r) { setTimeout(r, 1200); });
    }

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

    // Apps Script answers 200 with {status:'error'} for its own failures, so
    // the body is the real verdict, not the HTTP code.
    if (data && data.status === 'error') {
      res.status(502).json(data);
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({
      status: 'error',
      message: isWrite ? 'Could not save to the CRM backend.' : 'Could not reach the CRM backend.'
    });
  }
};
