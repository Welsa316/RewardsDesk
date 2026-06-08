export const SOURCE_LABELS = {
  'qr-lobby': 'Lobby QR',
  'qr-room': 'Room QR',
  canary: 'Canary',
  'front-desk': 'Front desk',
  manual: 'Manual',
  other: 'Other',
};

export function sourceLabel(s) {
  return SOURCE_LABELS[s] || s || '—';
}

export const STATUS_LABELS = {
  pending: 'Pending',
  enrolled: 'Enrolled',
  declined: 'Declined',
  already_member: 'Already a member',
  duplicate: 'Duplicate',
};

export function statusLabel(s) {
  return STATUS_LABELS[s] || s || '—';
}

export function fullName(e) {
  return `${e?.first_name ?? ''} ${e?.last_name ?? ''}`.trim();
}

export function oneLineAddress(e) {
  if (!e) return '';
  const line1 = [e.address_line1, e.address_line2].filter(Boolean).join(', ');
  const line2 = [e.city, e.state, e.postal_code].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(' · ');
}

// A neatly formatted block for one-tap transcription into the BW terminal.
export function copyAllBlock(e) {
  const cityLine = [e.city, e.state, e.postal_code].filter(Boolean).join(', ');
  return [
    `Name: ${fullName(e)}`,
    e.email && `Email: ${e.email}`,
    e.phone && `Phone: ${e.phone}`,
    e.address_line1 && `Address: ${e.address_line1}`,
    e.address_line2 && `Address 2: ${e.address_line2}`,
    cityLine && `City/State/ZIP: ${cityLine}`,
    e.country && `Country: ${e.country}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.round(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
