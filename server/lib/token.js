import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'rd_token';
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set.');
  return s;
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, role: user.role }, secret(), {
    expiresIn: `${MAX_AGE_DAYS}d`,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  };
  if (isProd && process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

// Same attributes minus maxAge, so the browser actually clears the cookie.
export function clearCookieOptions() {
  const { maxAge, ...rest } = cookieOptions();
  return rest;
}
