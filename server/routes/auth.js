import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { signToken, COOKIE_NAME, cookieOptions, clearCookieOptions } from '../lib/token.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { cleanStr } from '../lib/validation.js';

const router = Router();

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = cleanStr(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await query(
      'SELECT id, name, email, password_hash, role, active FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    // Always run a compare to avoid leaking whether the email exists via timing.
    const ok = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv');

    if (!user || !user.active || !ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    res.json({ id: user.id, name: user.name, role: user.role });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
