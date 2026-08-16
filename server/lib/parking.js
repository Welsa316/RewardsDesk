// Parking domain logic: pricing, durations, confirmation codes, and the ONE
// derived-status SQL fragment shared by every query that reports a session's
// display status (guest page, staff list, dashboard must never disagree).
import crypto from 'node:crypto';

export const HOURLY_MIN = 1;
export const HOURLY_MAX = 23;
export const DAILY_MIN = 1;
export const DAILY_MAX = 14;

// The sole price authority. Client-sent amounts are never trusted anywhere.
// Returns integer cents, or null for an invalid rate/quantity combination.
export function priceCents(rateType, quantity, rates) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty)) return null;
  if (rateType === 'hourly') {
    if (qty < HOURLY_MIN || qty > HOURLY_MAX) return null;
    // Hourly total is capped at the daily rate — guests never pay more per
    // 23 hours than a day would cost.
    return Math.min(qty * rates.parking_hourly_cents, rates.parking_daily_cents);
  }
  if (rateType === 'daily') {
    if (qty < DAILY_MIN || qty > DAILY_MAX) return null;
    return qty * rates.parking_daily_cents;
  }
  return null;
}

export function durationHours(rateType, quantity) {
  return rateType === 'daily' ? Number(quantity) * 24 : Number(quantity);
}

export function durationLabel(rateType, quantity) {
  const qty = Number(quantity);
  if (rateType === 'daily') return `${qty} day${qty === 1 ? '' : 's'}`;
  return `${qty} hour${qty === 1 ? '' : 's'}`;
}

// Confirmation codes: P- + 6 chars from an alphabet with no I/L/O/0/1, so the
// code survives handwriting and phone calls. ~1.07B combinations.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateConfirmationCode() {
  let code = 'P-';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Display-status CASE expression for SQL queries. `expMinutes` comes from
// settings (server-side, validated) and is interpolated as a checked integer
// to keep the fragment free of bind-parameter position coupling.
export function derivedStatusSql(alias, expMinutes) {
  const exp = Number.isInteger(Number(expMinutes)) && Number(expMinutes) > 0 ? Number(expMinutes) : 60;
  const a = alias;
  return `CASE
    WHEN ${a}.disposition = 'pending_payment' THEN 'pending_payment'
    WHEN ${a}.disposition = 'canceled' THEN 'canceled'
    WHEN ${a}.disposition = 'departed' THEN 'departed'
    WHEN ${a}.paid_through IS NULL THEN 'pending_payment'
    WHEN now() > ${a}.paid_through THEN 'expired'
    WHEN ${a}.kind = 'comp' THEN 'complimentary'
    WHEN now() > ${a}.paid_through - make_interval(mins => ${exp}) THEN 'expiring_soon'
    ELSE 'active'
  END`;
}

// Statuses that occupy a physical space (drive the capacity math).
export const OCCUPYING_SQL = (alias) =>
  `${alias}.disposition = 'active'`;
