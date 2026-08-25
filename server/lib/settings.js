import { query } from '../db/index.js';

// The settings singleton is read on nearly every request — the guest status
// page alone hits it up to 15 times during the post-payment confirm poll. It
// changes only when an admin saves the Settings form, so a short TTL removes
// the repetition without letting an edit go unnoticed for long. `invalidate()`
// makes a save visible immediately.
const TTL_MS = 5000;
let cache = null;
let cachedAt = 0;

export function invalidateSettings() {
  cache = null;
}

export async function getSettings() {
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  const { rows } = await query('SELECT * FROM settings WHERE id = 1');
  cache = rows[0] || {};
  cachedAt = now;
  return cache;
}

// Every day/month/year boundary in the app is a calendar boundary at the
// property, never in the database's timezone.
export async function hotelTimezone() {
  return (await getSettings()).timezone || 'UTC';
}
