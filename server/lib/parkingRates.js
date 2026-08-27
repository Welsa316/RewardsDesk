import { query } from '../db/index.js';
import { hotelTimezone } from './settings.js';

/**
 * The daily rate in force right now, and the promo responsible if one is.
 *
 * Every price calculation goes through here — guest checkout, guest extension,
 * staff-created sessions, staff extensions, and the rate shown on the public
 * form — so a guest can never be quoted one rate and charged another.
 *
 * Active is judged on the hotel's calendar day, matching the promo's inclusive
 * date range. Where two promos overlap the cheapest wins, per the brief.
 */
export async function activeDailyRate(defaultCents) {
  const tz = await hotelTimezone();
  const { rows } = await query(
    `SELECT id, name, rate_cents, end_date
       FROM parking_promos
      WHERE (now() AT TIME ZONE $1)::date BETWEEN start_date AND end_date
      ORDER BY rate_cents ASC, id ASC
      LIMIT 1`,
    [tz],
  );
  const promo = rows[0];
  // A promo priced above the standard rate would be a price *rise* rather than
  // an offer, so it is ignored rather than applied.
  if (!promo || promo.rate_cents >= defaultCents) {
    return { rateCents: defaultCents, standardCents: defaultCents, promo: null };
  }
  return {
    rateCents: promo.rate_cents,
    standardCents: defaultCents,
    promo: { id: promo.id, name: promo.name, rate_cents: promo.rate_cents, end_date: promo.end_date },
  };
}
