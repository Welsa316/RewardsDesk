export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Central error handler. 5xx errors are logged and never leak internals to the
// client; 4xx messages are passed through. 503 is the deliberate
// "service not configured/available" state, so its message passes through too.
//
// Only `err.status` counts, and only our own code sets it (lib/stripe.js's 503).
// `err.statusCode` used to be honoured as well, which quietly handed the whole
// error channel to the Stripe SDK: every StripeError carries a statusCode and
// its own message, so a bad API key answered an unauthenticated guest with
// 401 "Invalid API Key provided: sk_live_…", and a Stripe 401 during a refund
// tripped the client's auth interceptor and threw the admin back to the login
// screen mid-refund. Someone else's status code is not ours to return.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
    ? err.status
    : 500;
  if (status >= 500) console.error(err);
  const message =
    status >= 500 && status !== 503 ? 'Something went wrong.' : err.message || 'Request failed.';
  res.status(status).json({ error: message });
}
