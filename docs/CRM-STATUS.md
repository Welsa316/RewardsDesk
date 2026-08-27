PROJECT: RewardsDesk — Hotel Guest Systems
CLIENT: Best Western Plus New Orleans Airport Hotel (Property 19119)
STATUS: Build complete — pending Stripe test key + production deploy
LAST UPDATED: 2026-08-21
REPO: github.com/Welsa316/RewardsDesk (private/public — owner-transferable)
STACK: Vue 3 + Vite + Tailwind + Pinia | Express + PostgreSQL (raw SQL) | Stripe | Railway
------------------------------------------------------------

SCOPE: Two products, one login, one deployment.
  1. REWARDS — front-desk Best Western Rewards enrollment intake + tracking
  2. GUEST PARKING — white-label self-serve paid parking (guests never see it's connected)

============================================================
MODULE 1 — REWARDS (original proposal) — DELIVERED
============================================================
[x] Public guest intake form (/enroll) — mobile-first, hotel-branded
[x] Device autofill — exact HTML autocomplete tokens so iOS/Android/password
    managers offer one-tap fill of name, email, phone, full address
[x] Prefilled links — URL parameters populate the form for per-guest sends
    (e.g. Canary), guest reviews + consents only
[x] QR code generation per intake source, downloadable PNG for printing
[x] Consent capture (checkbox + timestamp) on every submission
[x] Anti-spam: honeypot field, IP rate limiting, server-side validation
[x] Front-desk queue — pending worklist, one-click copy per field + "Copy all"
    for fast transcription into the Best Western terminal
[x] Status processing (Enrolled / Declined / Already a member / Duplicate)
    with agent attribution, timestamps, optimistic UI + undo
[x] Walk-up entry form for on-the-spot enrollments
[x] Owner dashboard — month vs goal, YTD vs goal, pending, today,
    30/90-day trend chart, source breakdown, live activity feed
[x] Per-agent leaderboard (accountability screen)
[x] Full enrollment list — filter by status/source/date, search, pagination
[x] Enrollment detail view with full history timeline + editable status/notes
[x] CSV export (admin) with date range + filters
[x] Admin: staff management (add / role / deactivate / reset password)
[x] Admin: settings (hotel name, property code, goals, sources, time zone)
[x] Roles: admin (owner) vs staff (front desk); no public signup
[x] PWA — installable, offline-aware, branded icons
[x] Chain logo removed app-wide; neutral text wordmark + neutral install icons

NOTE ON SCOPE (unchanged from proposal): the app does NOT enroll anyone in
Best Western Rewards and does not connect to any BW or Canary system — no
public API exists. The front desk completes the real enrollment on the BW
terminal; this app makes that fast and measurable.

============================================================
MODULE 2 — GUEST PARKING (added) — DELIVERED
============================================================
[x] White-label public pages — admin-configurable brand name, neutral tab
    title/favicon; no rewards or hotel-app branding visible to guests
[x] Guest flow: scan lot QR -> /park -> name, phone, license plate, room,
    optional email -> pick duration -> pay -> private status link
[x] Pricing: hourly + daily, admin-editable; hourly total auto-capped at the
    daily rate; prices always computed server-side (client amounts never trusted)
[x] Stripe hosted Checkout (card data never touches our server; Apple/Google Pay
    supported automatically)
[x] Tokenized guest status page — live countdown, paid-through time,
    confirmation code, receipt link, no login required
[x] Guest self-serve extension (pays difference; never bills expired time)
[x] Staff-created sessions: complimentary (reason + authorizer recorded) and
    paid-at-desk (cash / card terminal)
[x] Live active-vehicle list with search by plate, name, phone, confirmation #
[x] Statuses: Active / Expiring Soon / Expired / Departed / Complimentary
[x] Vehicle check-out with employee + timestamp recorded
[x] Overstay detection + overdue filter
[x] Parking capacity dashboard (on lot / available / leaving today / overdue)
[x] Revenue reporting: today, week, month, custom range, average transaction,
    paid vehicles, average length of stay, hourly vs daily split, refund totals
[x] Refunds — full or partial, admin-only, reason required, fully audited
[x] Receipts — Stripe auto-emails; receipt URL stored + viewable by staff
[x] Session notes with author + timestamp
[x] Per-lot QR codes for parking signs (printable)
[x] Parking settings: brand, rates, capacity, expiring-soon window, lot list
[x] CSV export of parking sessions (admin)

============================================================
CLIENT-REQUESTED ENHANCEMENTS (from review notes) — DELIVERED
============================================================
[x] Qualification tracking — separate admin-only Qualified/Disqualified outcome
    recorded after Best Western reports back; dashboard shows qualification rate
    (over reviewed records) + awaiting-review count
[x] Duplicate enrollment detection — warns staff at the queue and walk-up form
    when email, phone, or name matches an existing record
[x] Enhanced staff performance — today / month-to-date / year-to-date, qualified
    counts, conversion %, goal progress + remaining, ranking
[x] Per-employee monthly goals, editable by admin (no developer needed)
[x] Enrollment audit log — created, status changed, qualified, notes edited,
    deleted; each with who + when + what
[x] Improved activity feed reflecting all audit events
[x] Reporting export includes qualification columns

============================================================
DELIBERATELY EXCLUDED (with reasons)
============================================================
[-] SMS sending — planned as a separate texting app; this app exposes the
    documented prefilled-link format for it to use
[-] Email sending beyond Stripe receipts — no email infrastructure required
[-] In-app notification center / goal alerts — the information is already
    on screen (queue badge, goal bars); alerts that fire constantly get ignored
[-] Quarterly property + daily employee goals — quarterly is monthly x3;
    daily is noise on variable front-desk shifts
[-] License plate cameras / ID scanning — out of scope
[-] Multi-property support — single hotel by design

============================================================
SECURITY / COMPLIANCE
============================================================
[x] Passwords hashed (bcrypt, cost 12)
[x] Login rate limiting + public endpoint rate limiting
[x] Automatic session expiry (JWT in httpOnly cookie)
[x] Immediate account deactivation
[x] Admin password reset
[x] Administrative audit trails (rewards + parking payments)
[x] HTTP security headers + content security policy
[x] No card data stored — Stripe holds all card details; only Stripe IDs kept
[x] No SSNs or payment data collected; guest PII limited to name/contact/vehicle
[x] Soft-delete + data retention purge tool for old records
[x] Accessibility pass (WCAG AA contrast, keyboard/screen-reader support)

============================================================
REMAINING BEFORE GO-LIVE
============================================================
[ ] Obtain Stripe TEST key -> end-to-end test payment + refund  <-- IN PROGRESS
[ ] Hotel creates/activates its own Stripe account (receives all revenue)
[ ] Deploy to Railway + attach PostgreSQL, set environment variables
[ ] Point custom hotel domain at the app (replaces temporary Railway URL)
[ ] Switch Stripe to LIVE key + live webhook endpoint; run one real card test
[ ] Print QR codes (rewards sources + parking lots) after domain is final
[ ] Create real staff accounts; set property + per-employee goals
[ ] Ownership transfer: hosting, database, repo, Stripe, domain, admin credentials

============================================================
HANDOFF ASSETS INCLUDED
============================================================
- HANDOFF.md — ownership transfer checklist, environment variables, Stripe
  setup, test-to-live switch steps, backup/restore, operations quick reference
- README.md — full feature documentation + local/production setup
- Screenshots of all public and admin screens
