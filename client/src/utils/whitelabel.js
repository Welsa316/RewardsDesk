// White-label helpers for the public parking pages: the browser tab must not
// leak the rewards app's name or hotel favicon. Restored on unmount so the
// staff app is unaffected when navigating back.
const P_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0F1B2D"/><text x="32" y="45" font-family="Georgia, serif" font-size="36" font-weight="700" fill="#FFFFFF" text-anchor="middle">P</text></svg>',
  );

let saved = null;

export function applyParkingChrome(title) {
  const link = document.querySelector('link[rel="icon"]');
  if (saved === null) {
    saved = { title: document.title, href: link?.getAttribute('href') || null };
  }
  document.title = title || 'Guest Parking';
  link?.setAttribute('href', P_FAVICON);
}

export function restoreChrome() {
  if (saved === null) return;
  document.title = saved.title;
  const link = document.querySelector('link[rel="icon"]');
  if (saved.href) link?.setAttribute('href', saved.href);
  saved = null;
}
