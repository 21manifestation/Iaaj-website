// Receiver for Tally.so's webhook (Settings -> Integrations -> Webhooks on
// the form, pointed at https://itsallaboutjourney.com/api/tally-webhook).
//
// Found 22 Sep 2026: Tally submissions were only ever landing in Tally's own
// connected Google Sheet, completely disconnected from the CRM - a real
// lead (Pallavi Shahane) sat there with no round-robin assignment, no rep,
// no follow-up, invisible to everyone. This closes that gap the same way
// every other lead source (enquiry form, WhatsApp, Instagram/Superreply)
// already reaches the CRM: through logToCrm below, same field contract.
//
// Tally's webhook payload shape (data.fields[], each {key,label,value}) is
// matched by LABEL, not by field key/order - Tally's field keys are opaque
// per-form IDs that would silently stop matching the moment anyone edits a
// question in the Tally builder. Matching by label survives that.
const CRM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxhhkL_pBf91KHLSFaXlc8YOZR5rCgbQpSpMsQswF5e0zR9QdiVR0DkAXVoa-n9bVqS/exec';

function findField(fields, ...labelContains) {
  const f = fields.find(function (field) {
    const label = String(field.label || '').toLowerCase();
    return labelContains.some(function (needle) { return label.indexOf(needle) !== -1; });
  });
  if (!f || f.value === null || f.value === undefined) return '';
  return Array.isArray(f.value) ? f.value.join(', ') : String(f.value);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'POST only.' });
    return;
  }

  try {
    const fields = (req.body && req.body.data && req.body.data.fields) || [];

    const name = findField(fields, 'name');
    const email = findField(fields, 'email');
    const phone = findField(fields, 'phone', 'whatsapp', 'mobile', 'contact number');
    const age = findField(fields, 'age');
    const weight = findField(fields, 'weight');
    const height = findField(fields, 'height');
    const occupation = findField(fields, 'occupation', 'work');
    const location = findField(fields, 'location', 'city');

    const notes = ['Age: ' + (age || 'N/A'), 'Weight: ' + (weight || 'N/A'), 'Height: ' + (height || 'N/A'), 'Occupation: ' + (occupation || 'N/A')]
      .join(' | ');

    // High Intent, not QUALIFIED - same default every other source gets.
    // Someone filling in age/weight/height/occupation is clearly a real,
    // serious lead (not a guide download), so this shouldn't be silently
    // skipped as top-of-funnel either - but only a rep actually talking to
    // her should be the one to upgrade her to QUALIFIED.
    const saved = await logToCrm({
      name: name,
      phone: phone,
      email: email,
      city: location,
      source: 'Tally Form Application',
      notes: notes
    });

    res.status(200).json({ status: saved ? 'success' : 'error' });
  } catch (err) {
    console.error('tally-webhook error', err);
    // Still 200 - Tally does not retry on non-2xx the way Meta does, but
    // there is no reader waiting on this response either way, so there is
    // nothing to gain from a 500 here and a failed CRM write is already
    // logged above via logToCrm's own console.error.
    res.status(200).json({ status: 'error' });
  }
};

async function logToCrm(fields) {
  const body = new URLSearchParams(fields);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(CRM_ENDPOINT, { method: 'POST', body: body, redirect: 'follow' });
      if (resp.ok) {
        const text = await resp.text();
        if (text.indexOf('"status":"success"') !== -1) return true;
        console.error('tally-webhook logToCrm: CRM returned a non-success body', text.slice(0, 200));
      } else {
        console.error('tally-webhook logToCrm: CRM returned HTTP', resp.status);
      }
    } catch (err) {
      console.error('tally-webhook logToCrm attempt ' + attempt + ' threw', err);
    }
    if (attempt === 1) await new Promise(function (r) { setTimeout(r, 1500); });
  }
  return false;
}
