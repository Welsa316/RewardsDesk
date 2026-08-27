// US state and territory codes accepted for a licence plate. Two letters,
// stored uppercase. DC is included; the brief asks for the 50 states plus DC.
export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
];

export const DEFAULT_STATE = 'LA';

/** Returns a valid uppercase code, or null when absent/unrecognised. */
export function cleanPlateState(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return US_STATES.includes(code) ? code : null;
}
