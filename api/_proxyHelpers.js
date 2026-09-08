// Shared logic for the write-only Apps Script proxies (guides.js,
// enquiry.js, quiz.js, onboarding.js). Prefixed with _ so Vercel does not
// treat this as a route of its own - it has no module.exports handler
// shape, only the factory below.
//
// Each caller is locked to exactly one hardcoded target URL passed in at
// import time - this is deliberately NOT a generic "proxy to any URL"
// endpoint. A generic version would let anyone POST to any of these five
// Apps Script deployments through our own domain, which is a bigger
// attack surface than five small files with the same twelve lines in them.
//
// The bug this exists to fix, present identically across the whole site
// before this: browser -> Apps Script direct with mode:'no-cors'. That
// mode returns an OPAQUE response, which resolves successfully even when
// Apps Script 500'd or timed out on its lock - so every one of these
// forms could tell a visitor "done" while silently discarding their
// submission, with nothing anywhere to show it happened.
function createProxy(targetUrl, label) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
      res.status(405).json({ status: 'error', message: 'POST only.' });
      return;
    }

    const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString();

    let upstream = null;
    let text = '';

    // One retry. This function reliably receives the browser's request
    // (same origin, no CORS/redirect quirks) - the fragile hop is the one
    // into Apps Script, where a lock timeout under load is the observed
    // failure mode (found originally in the CRM, same infra pattern here).
    for (let i = 0; i < 2; i++) {
      try {
        upstream = await fetch(targetUrl, {
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
      if (i === 0) await new Promise((r) => setTimeout(r, 1200));
    }

    if (!upstream || !upstream.ok) {
      console.error(label + ' submission failed to reach Apps Script', text.slice(0, 500));
      res.status(502).json({ status: 'error', message: 'Could not save the ' + label + ' submission.' });
      return;
    }

    res.status(200).json({ status: 'success' });
  };
}

module.exports = { createProxy };
