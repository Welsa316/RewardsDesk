// US states plus DC, for the licence-plate selector. Kept in sync with
// server/lib/states.js, which is the authority — anything not on the server's
// list is stored as null.
export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
];

// The property is in Louisiana, so most plates are LA.
export const DEFAULT_STATE = 'LA';

/** "ABC123 · LA", or just the plate for rows recorded before plate_state. */
export function formatPlate(plate, state) {
  if (!plate) return '';
  return state ? `${plate} · ${state}` : plate;
}
