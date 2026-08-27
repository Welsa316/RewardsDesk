#!/usr/bin/env node
/**
 * Staff permission checklist.
 *
 * Signs in as a staff user and as an admin, then hits every route the staff
 * policy covers, asserting the status code each role should get. This exists
 * because hiding a button is not a permission — the server is what enforces it,
 * so the server is what gets tested.
 *
 * Usage:
 *   node server/scripts/check-staff-permissions.mjs \
 *     --base http://localhost:3000 \
 *     --staff staff@example.com:password \
 *     --admin owner@example.com:password
 *
 * Exits non-zero if any expectation fails.
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const BASE = args.base || 'http://localhost:3000';
const [staffEmail, staffPass] = (args.staff || '').split(':');
const [adminEmail, adminPass] = (args.admin || '').split(':');

if (!staffEmail || !adminEmail) {
  console.error('Need --staff email:password and --admin email:password');
  process.exit(2);
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  return cookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}

async function call(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

// Each case: [method, path, body, staffExpectation, description]
// `allow` means "not 403" — a 404 or 422 still proves the role gate let it past.
const ALLOWED = 'allow';
const FORBIDDEN = 403;

const CASES = [
  // ── Staff run the front desk ────────────────────────────────────────
  ['GET', '/api/enrollments?pageSize=1', null, ALLOWED, 'view rewards guests'],
  ['GET', '/api/stats/dashboard', null, ALLOWED, 'view the dashboard'],
  ['POST', '/api/enrollments', { first_name: 'Perm', last_name: 'Check', email: 'perm@check.test', consent: true }, ALLOWED, 'add a walk-up enrollment'],
  ['GET', '/api/parking/sessions?pageSize=1', null, ALLOWED, 'view parked cars'],
  ['GET', '/api/parking/dashboard', null, ALLOWED, 'view the parking overview'],
  ['POST', '/api/parking/sessions/999999/depart', null, ALLOWED, 'check a vehicle out'],
  ['POST', '/api/parking/sessions/999999/extend', { method: 'comp', rate_type: 'daily', quantity: 1 }, ALLOWED, 'extend a session'],
  ['POST', '/api/parking/sessions/999999/notes', { body: 'x' }, ALLOWED, 'add a session note'],
  ['GET', '/api/staff', null, ALLOWED, 'view users'],

  // ── Money, configuration and bulk data stay with the owner ──────────
  ['POST', '/api/parking/sessions/999999/refund', { payment_id: 1, reason: 'x' }, FORBIDDEN, 'issue a refund'],
  ['DELETE', '/api/enrollments/999999', null, FORBIDDEN, 'delete an enrollment'],
  ['POST', '/api/enrollments/purge', { days: 400 }, FORBIDDEN, 'purge enrollments'],

  ['GET', '/api/settings', null, FORBIDDEN, 'read settings'],
  ['PATCH', '/api/settings', { hotel_name: 'x' }, FORBIDDEN, 'change settings'],

  ['GET', '/api/promos', null, FORBIDDEN, 'list promo images'],
  ['POST', '/api/promos', { title: 'x' }, FORBIDDEN, 'create a promo image'],
  ['GET', '/api/parking-promos', null, FORBIDDEN, 'list rate promos'],
  ['POST', '/api/parking-promos', { name: 'x', rate_cents: 100 }, FORBIDDEN, 'create a rate promo'],

  ['POST', '/api/staff', { name: 'x', email: 'x@y.z', password: 'abcdefghij' }, FORBIDDEN, 'create a user'],
  ['PATCH', '/api/staff/999999', { role: 'admin' }, FORBIDDEN, 'change a user role'],
  ['DELETE', '/api/staff/999999', null, FORBIDDEN, 'deactivate a user'],

  ['GET', '/api/export', null, FORBIDDEN, 'export the rewards CSV'],
  ['GET', '/api/parking/export', null, FORBIDDEN, 'export the parking CSV'],
];

const staff = await login(staffEmail, staffPass);
const admin = await login(adminEmail, adminPass);

let failed = 0;
console.log(`\nStaff permission checklist against ${BASE}\n`);

for (const [method, path, body, expectation, label] of CASES) {
  const status = await call(staff, method, path, body);
  const ok = expectation === ALLOWED ? status !== 403 : status === expectation;
  if (!ok) failed++;
  const verdict = ok ? 'ok  ' : 'FAIL';
  const got = expectation === ALLOWED ? `${status} (not 403)` : String(status);
  console.log(`  ${verdict} staff ${expectation === ALLOWED ? 'may   ' : 'cannot'} ${label.padEnd(32)} ${got}`);
}

// The negative cases only mean something if an admin genuinely can do them —
// otherwise a broken route would look like a passing permission check.
console.log('');
let adminFailed = 0;
for (const [method, path, body, expectation, label] of CASES) {
  if (expectation !== FORBIDDEN) continue;
  const status = await call(admin, method, path, body);
  if (status === 403) {
    adminFailed++;
    console.log(`  FAIL admin was also blocked from ${label} (${status}) — gate is too tight`);
  }
}
if (!adminFailed) console.log('  ok   admin is not blocked by any of the above');

console.log(`\n${failed + adminFailed === 0 ? 'PASS' : `FAILED (${failed + adminFailed})`}\n`);
process.exit(failed + adminFailed === 0 ? 0 : 1);
