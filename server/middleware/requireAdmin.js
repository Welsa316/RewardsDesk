// Role gate. Staff are deliberately near-read-only: they may view rewards
// guests, change a guest's rewards status, view parked cars, and view the user
// list. Everything else that creates, edits or deletes is admin-only.
//
// This is enforced here, in route middleware, rather than by hiding buttons —
// hidden UI is a convenience, not a permission.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'This action is restricted to administrators.' });
  }
  next();
}

/**
 * Guards a route that staff may READ but only an admin may CHANGE.
 * GET and HEAD pass for any signed-in user; every other verb needs admin.
 */
export function readOnlyForStaff(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return requireAdmin(req, res, next);
}

export default requireAdmin;
