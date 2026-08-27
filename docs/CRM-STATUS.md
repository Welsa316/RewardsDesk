PROJECT: RewardsDesk — Hotel Guest Systems
CLIENT: Best Western Plus New Orleans Airport Hotel (Property 19119)
STATUS: LIVE at msybestparking.com — pending Twilio toll-free verification
           and the Stripe test-to-live switch
LAST UPDATED: 2026-08-27
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
[x] Pricing: daily only, admin-editable; scheduled promo rates override the
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
    paid vehicles, average length of stay, refund totals
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
UPDATE — 2026-08-27  (since the last review)
25 commits. Deployed and serving at msybestparking.com.
============================================================

NOW LIVE / NEW FOR GUESTS
[x] Custom domain live — msybestparking.com (replaces the temporary host)
[x] Public home page at the root — two paths, Pay for Parking and Rewards
    Enrollment, plus tappable phone/email and the franchise disclaimer.
    Previously the bare domain opened the staff login to the public.
[x] TEXT-TO-PARK — guest texts PARK to (844) 314-PARK / 314-7275 and gets a
    payment link back. If that phone already has a car on the lot, they get
    their own status link instead, which solves guests losing it.
[x] SMS opt-in policy page (/sms) + the lot sign hosted publicly — the two
    pieces of evidence Twilio requires for toll-free verification.
[x] Chain logo removed everywhere and the chain name taken off guest-facing
    pages. The name remains only in the consent sentence, where it is needed
    for the guest to know what they are joining. Franchise disclaimer added
    to every public page.
[x] Promotional image ads — admin uploads an image with a start and end date;
    it appears automatically on the home page and the parking payment page
    for that window only.

CHANGED — OPERATIONALLY SIGNIFICANT
[!] HOURLY PARKING REMOVED. Parking is sold by the day only. Existing hourly
    sessions still display correctly; nothing new can be bought hourly.
[!] Scheduled rate promos — a special daily rate for a date range, with the
    regular rate shown struck through. Overlapping promos use the lowest.
[!] Staff role scoped. Staff run the desk: rewards queue and notes, walk-ups,
    parked cars, comp and paid-at-desk sessions, check-out, extensions,
    session notes, and viewing users. Refunds, both CSV exports, settings,
    promos, staff management, deletions and the qualification field are
    owner-only, enforced on the server rather than by hiding buttons.
[!] Admin login moved to /admin/login; the whole staff app now lives under
    /admin. Old bookmarks redirect automatically.
[!] Licence plate state added — dropdown on every plate field, defaults to LA,
    shown wherever plates are listed. Lookups match plate + state.

EMAIL (new capability — previously excluded)
[x] Resend integration with three notifications: parking receipt to the
    driver, rewards enrolment confirmation to the guest, and an alert to the
    owner on every new enrolment. A failed send can never fail a payment or
    an enrolment. Awaiting domain verification in Resend.

PRE-LAUNCH AUDIT — COMPLETED
Full independent audit across security, payments, data integrity, frontend
correctness, accessibility, performance and copy. Roughly 75 verified issues;
every ship-blocker and high-priority item fixed and individually re-tested.
The ones that mattered most:
[x] A mistyped partial refund issued a FULL refund. Reproduced against the
    old code, then fixed on both the server and the form.
[x] Two staff refunding the same payment at once could both succeed.
[x] On a shared front-desk tablet, a signed-out user could be signed back in
    as the PREVIOUS user with their permissions.
[x] Guest data was cached on the device indefinitely and survived sign-out.
[x] Enrolments after ~7pm were being reported on the wrong day — meaning the
    Best Western credit export, the one report the property is paid on,
    contained the wrong rows.
[x] Every redeploy silently reset the owner's password and reactivated any
    deactivated admin.
[x] Both CSV exports ignored the filters on screen and exported everything.
[x] Rate limits counted the whole hotel as one guest, so the 21st car of the
    hour would have been refused having never tried.
[x] Guest page load cut from 196 KB to 71 KB.

OPS
[x] Settings now shows which integrations are actually configured on the
    server (Stripe, SMS, email, image storage) — no more guessing whether a
    variable landed.
[x] The QR page refuses to generate codes against a temporary hosting
    address, so no one prints a stack of dead or self-identifying signs.

REMAINING BEFORE FULLY OPEN
[ ] Twilio toll-free verification approval  <-- IN PROGRESS, blocks texting
[ ] Verify the sending domain in Resend (turns the three emails on)
[ ] Stripe: swap test key for live, create the live webhook, one real card test
[ ] Point www.msybestparking.com at the app (currently only the bare domain)
[ ] Set the Stripe public business name if parking should look independent
    of the hotel on receipts and card statements
[ ] Create real staff accounts and set goals
[ ] Ownership transfer: hosting, database, repo, Stripe, domain, credentials

============================================================
HANDOFF ASSETS INCLUDED
============================================================
- HANDOFF.md — ownership transfer checklist, environment variables, Stripe
  setup, test-to-live switch steps, backup/restore, operations quick reference
- README.md — full feature documentation + local/production setup
- Screenshots of all public and admin screens
