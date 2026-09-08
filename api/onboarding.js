// Server-side proxy for the client onboarding Apps Script (write-only).
//
// Same reliability fix as api/crm.js, applied here because this is the
// highest-stakes form on the site: it carries a paying client's full
// intake (medical history, measurements, two photos) as a single
// submission with no draft-save and no way for the client to know if it
// silently failed. It previously POSTed direct to Apps Script with
// mode:'no-cors', which returns an opaque response - the form showed
// "success" and moved on regardless of whether Apps Script actually wrote
// anything, and a lock timeout under load (the same failure mode found in
// the CRM) would have discarded the whole intake with nothing to show for
// it - not even a normal support conversation to notice from, since the
// client believes they are done.
//
// Photos are already compressed client-side to ~1280px JPEGs before this
// ever runs, so the base64 payload stays well under Vercel's request body
// limit.

const ONBOARDING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbym0dzREDgc6IJvysBb-OyIreFi5u_X_rgA2A6gu7dl2SUzy4ocHIZv6oK_2ATz9qtzxg/exec';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'POST only.' });
    return;
  }

  const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString();

  let upstream = null;
  let text = '';

  // One retry, same reasoning as api/crm.js: this function reliably
  // receives the client's submission (it's the same origin, no CORS/
  // redirect issues); the fragile hop is the one into Apps Script.
  for (let i = 0; i < 2; i++) {
    try {
      upstream = await fetch(ONBOARDING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
        redirect: 'follow'
      });
      text = await upstream.text();
      if (upstream.ok) break;
    } catch (err) {
      text = String(err);
    }
    if (i === 0) await new Promise(function (r) { setTimeout(r, 1200); });
  }

  if (!upstream || !upstream.ok) {
    // Logged for Gaurav to find in Vercel's function logs - there is no
    // other trace of a failed onboarding submission anywhere.
    console.error('Onboarding submission failed to reach Apps Script', text.slice(0, 500));
    res.status(502).json({ status: 'error', message: 'Could not save the onboarding submission.' });
    return;
  }

  res.status(200).json({ status: 'success' });
};
