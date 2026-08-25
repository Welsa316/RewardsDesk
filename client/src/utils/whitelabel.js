// White-label helpers for the public parking pages. A guest must not be able to
// tell the parking product is attached to the hotel's rewards app — that means
// the tab title, the favicon, the meta description AND the web app manifest
// (which is what an installed home-screen app takes its name and icon from).
// Everything is restored on unmount so the staff app is unaffected.
const P_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0F1B2D"/><text x="32" y="45" font-family="Georgia, serif" font-size="36" font-weight="700" fill="#FFFFFF" text-anchor="middle">P</text></svg>',
  );

const PARKING_MANIFEST = '/api/public/parking-manifest';
const PARKING_DESCRIPTION = 'Pay for parking and check your time.';

let saved = null;

// Most brands the owner sets already contain the word "Parking" ("Airport Guest
// Parking"), so appending it unconditionally stutters in the tab.
export function parkingTitle(brand, detail) {
  const base = /parking/i.test(brand) ? brand : `${brand} — Parking`;
  return detail ? `${base} · ${detail}` : base;
}

function metaEl(name) {
  return document.querySelector(`meta[name="${name}"]`);
}

function manifestEl() {
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    // vite-plugin-pwa injects this at build time; in dev it may be absent.
    link = document.createElement('link');
    link.setAttribute('rel', 'manifest');
    document.head.appendChild(link);
  }
  return link;
}

export function applyParkingChrome(title) {
  const icon = document.querySelector('link[rel="icon"]');
  const manifest = manifestEl();
  const desc = metaEl('description');
  // Capture once — a second apply (e.g. a late poll callback) must not
  // overwrite the saved staff-app values with the parking ones.
  if (saved === null) {
    saved = {
      title: document.title,
      icon: icon?.getAttribute('href') || null,
      manifest: manifest.getAttribute('href') || null,
      description: desc?.getAttribute('content') || null,
    };
  }
  document.title = title || 'Guest Parking';
  icon?.setAttribute('href', P_FAVICON);
  manifest.setAttribute('href', PARKING_MANIFEST);
  desc?.setAttribute('content', PARKING_DESCRIPTION);
}

export function restoreChrome() {
  if (saved === null) return;
  document.title = saved.title;
  const icon = document.querySelector('link[rel="icon"]');
  if (saved.icon) icon?.setAttribute('href', saved.icon);
  const manifest = document.querySelector('link[rel="manifest"]');
  if (saved.manifest) manifest?.setAttribute('href', saved.manifest);
  else manifest?.remove();
  const desc = metaEl('description');
  if (saved.description) desc?.setAttribute('content', saved.description);
  saved = null;
}
