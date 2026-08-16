export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Central error handler. 5xx errors are logged and never leak internals to the
// client; 4xx messages are passed through. 503 is the deliberate
// "service not configured/available" state, so its message passes through too.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message =
    status >= 500 && status !== 503 ? 'Something went wrong.' : err.message || 'Request failed.';
  res.status(status).json({ error: message });
}
