// Minimal focus-management helpers shared by Modal and the mobile drawer.
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (el) => el.getClientRects().length > 0 || el === document.activeElement,
  );
}

export function focusFirst(container) {
  const nodes = focusables(container);
  (nodes[0] || container)?.focus?.();
}

// Keep Tab / Shift+Tab cycling inside `container`. Call from a keydown handler.
export function trapTabKey(container, e) {
  if (e.key !== 'Tab' || !container) return;
  const nodes = focusables(container);
  if (!nodes.length) {
    e.preventDefault();
    container.focus?.();
    return;
  }
  const firstEl = nodes[0];
  const lastEl = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === firstEl || !container.contains(active))) {
    e.preventDefault();
    lastEl.focus();
  } else if (!e.shiftKey && (active === lastEl || !container.contains(active))) {
    e.preventDefault();
    firstEl.focus();
  }
}
