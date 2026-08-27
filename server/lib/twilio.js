import crypto from 'node:crypto';

// Twilio request signing, implemented directly rather than pulling in the SDK
// for one function. The algorithm is documented and stable:
//
//   1. Start with the full request URL, including any query string.
//   2. For a POST, append every form parameter sorted by key, as key+value
//      concatenated with no separators.
//   3. HMAC-SHA1 that string with the account's auth token, base64 encode.
//   4. Compare against the X-Twilio-Signature header.
//
// Without this, anyone who learns the endpoint could POST a fake inbound
// message and make the app hand out parking links.

export function twilioEnabled() {
  return Boolean(process.env.TWILIO_AUTH_TOKEN);
}

export function buildSignature(authToken, url, params) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

/**
 * Verifies X-Twilio-Signature. Returns false rather than throwing so the
 * caller can answer with a plain 403.
 */
export function verifyTwilioSignature({ authToken, signature, url, params }) {
  if (!authToken || !signature) return false;
  try {
    const expected = buildSignature(authToken, url, params || {});
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    // timingSafeEqual throws on length mismatch, so check that first.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * The URL Twilio signed. Behind Railway's proxy the request arrives as http on
 * an internal host, so the signature must be checked against the public URL
 * Twilio actually called — which is what PUBLIC_BASE_URL holds.
 */
export function signedUrlFor(req, publicBase) {
  const base = String(publicBase || '').replace(/\/+$/, '');
  return `${base}${req.originalUrl}`;
}

function escapeXml(value) {
  return String(value ?? '').replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );
}

/** A TwiML document containing a single reply message. */
export function twimlMessage(text) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${escapeXml(text)}</Message></Response>`;
}

/** A TwiML document with no reply — used when we deliberately stay silent. */
export function twimlEmpty() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<Response/>';
}
