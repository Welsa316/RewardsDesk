import { verifyToken, COOKIE_NAME } from '../lib/token.js';
import { query } from '../db/index.js';

// Verifies the JWT cookie and re-checks the user is still active, so a
// deactivated account loses access immediately rather than at token expiry.
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyToken(token);
    const { rows } = await query(
      'SELECT id, name, role, active FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Not authenticated' });

    req.user = { id: user.id, name: user.name, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}
