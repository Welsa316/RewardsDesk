# RewardsDesk

Two products in one hotel app:

1. **Rewards** — guest-intake and enrollment-tracking for the front desk (below).
2. **Guest Parking** — a white-label, self-serve paid-parking product: guests scan a QR
   on a parking sign, pay with Stripe, and track their time from a private link — while
   staff manage the lot from the same admin dashboard. See **Guest Parking** below.

RewardsDesk is an **intake + tracking layer that sits next to** the real Best Western
Rewards enrollment — it does **not** enroll anyone itself. Guests submit their details
(with as little typing as possible via browser autofill and prefilled links); each
submission lands in a front-desk worklist; the agent copies the details into the hotel's
own Best Western terminal to do the real, property-credited enrollment, then marks the
record and is attributed for it. The owner sees goal progress, trends, source breakdown,
and a per-agent leaderboard.

> **It deliberately does NOT** enroll anyone in Best Western Rewards, connect to or scrape
> any Best Western / Canary system, or pretend to be the official enrollment. There is no
> public BW API; the front desk completes the real enrollment on the BW terminal. The copy
> buttons just make that transcription fast.

## Features

- **Public `/enroll`** — mobile-first guest form with exact HTML `autocomplete` tokens (so
  iOS/Android/password managers offer one-tap fill) and URL-param prefill for personalized
  links. Consent-gated, honeypot-protected, rate-limited.
- **Queue** — pending worklist with per-field copy + "Copy all", and one-tap status actions
  (Enrolled / Declined / Already a member / Duplicate) that attribute the agent and write an
  audit trail. Optimistic UI with undo. Walk-up entry form.
- **Dashboard** — month/YTD progress vs goals, pending & today counts, a 30/90-day trend
  chart, source breakdown, and a recent-activity feed.
- **Enrollments** — filter by status/source/date + search, paginate, drill into a detail
  view (all fields, status-history timeline, editable status/notes), and export CSV.
- **Leaderboard** — per-agent processed / enrolled / conversion% over a date range.
- **Admin** — staff management (add, role, deactivate, reset password), settings (hotel
  name, property code, goals, sources, hotel time zone), QR + prefilled-link tools,
  CSV export, and data retention (purge old processed records). Daily/monthly stats
  are computed in the hotel's configured time zone.
- **PWA** — installable, offline-aware (Workbox), branded manifest + icons.

## Guest Parking

The parking product is deliberately **white-label**: the public pages carry only the
admin-configured parking brand name (Parking Settings) — no rewards or hotel-app branding,
a neutral tab title and favicon.

**Guest flow** — scan a lot QR → `/park?src=<lot>` → name / phone / plate / room
(optional) / email (optional, for the Stripe receipt) → pick hourly or daily duration
(hourly totals are capped at the daily rate) → pay on Stripe's hosted checkout →
land on a private status page `/park/s/<token>` with a live countdown, receipt link,
and self-serve **Extend** (pays the difference, never bills dead time:
`new paid-through = max(paid-through, now) + duration`).

**Staff/admin** (same login as rewards, "Parking" section in the sidebar):

- **Overview** — vehicles on lot vs capacity, leaving today, expired/overdue (deep-links
  to the filtered list), revenue today, and a revenue panel (today/week/month, custom
  range, avg transaction, paid vehicles, avg stay, hourly-vs-daily split, refunds).
- **Sessions** — live list with search (plate/name/phone/confirmation #), status filters
  (Active / Expiring soon / Expired / Departed / Comp), session detail with the payments
  audit trail, notes (author + timestamp), staff extensions (cash/terminal/comp),
  vehicle check-out with attribution, and staff-created sessions: **complimentary**
  (reason + authorizer recorded) or **paid at desk** (cash / card terminal).
- **Refunds** (admin) — full or partial per payment; Stripe charges refund through
  Stripe, desk/cash charges are recorded-only; every refund carries actor + reason.
- **Parking Settings** (admin) — brand name, hourly/daily rates, capacity,
  "expiring soon" window, lot list. **QR & links** prints a white-label QR per lot.

**Statuses** are derived at read time from `paid_through` (no cron): Active → Expiring
soon (window configurable) → Expired; overlaid by Departed / Complimentary. An expired
vehicle still occupies a space until checked out.

**Payments** — hosted Stripe Checkout only. Card data never touches this server; we
store only Stripe identifiers (checkout session, payment intent, refund ids) and the
receipt URL. Amounts are always computed server-side from the configured rates; the
webhook (`/api/parking/webhook`, signature-verified, idempotent) is the single source
of payment truth.

**Prefilled-link contract** (for a future SMS/messaging integration — no SMS is built
into this app): `/park?src=<lot>&name=&phone=&plate=&room=&rate=hourly|daily&qty=N`.
All params optional; the form prefills and the server re-validates everything.

**Local Stripe testing** — set `STRIPE_SECRET_KEY` (test mode) and either run
`stripe listen --forward-to localhost:3000/api/parking/webhook` (put its `whsec_` in
`STRIPE_WEBHOOK_SECRET`) or use any tool that signs events with your configured secret.
Pay with card `4242 4242 4242 4242`.

## Stack

- **Frontend:** Vue 3 (`<script setup>`) + Vite + Tailwind + Pinia. PWA via `vite-plugin-pwa`.
- **Backend:** Express + `pg` (raw SQL, no ORM) + PostgreSQL.
- **Auth:** JWT in an httpOnly cookie. Roles: `admin` (owner) and `staff` (front desk).
- **Deploy:** Railway, single service — in production Express serves the built client.

## Project structure

```
/client
  /src
    /api          axios instance + endpoint wrappers
    /components   AppShell, Sidebar, TopBar, StatCard, EnrollmentCard, StatusPill,
                  CopyField, CopyAllButton, AddressFields, TrendChart, Toast, Modal,
                  QrCard, PrefillLinkBuilder, BrandMark
    /router       public / auth / protected route groups + guard
    /stores       auth, enrollments, stats, settings, toast
    /utils        format, clipboard
    /views        Enroll, Login, Dashboard, Queue, Enrollments, EnrollmentDetail,
                  Leaderboard, Staff, Settings, QrCodes
  /public/icons   PWA icons (generated — see below)
  /scripts        generate-icons.js
/server
  /db             pg pool
  /lib            token, validation, enrollmentFilters
  /middleware     auth, requireAdmin, rateLimit, validate, errorHandler
  /migrations     raw SQL, run in filename order
  /routes         auth, intake, enrollments, stats, export, staff, settings
  migrate.js      applies pending migrations (tracked + idempotent)
  seed.js         creates the admin + settings row from env
  index.js        Express app (serves the built client in production)
package.json      root scripts (install / dev / migrate / seed / build / start)
```

## Prerequisites

- Node.js **20–22** (production runs 22 via `.node-version`)
- PostgreSQL **14+** (local install, Docker, or any managed Postgres)

## Local development

1. **Configure env** — copy the example and fill it in:

   ```bash
   cp .env.example .env
   # set DATABASE_URL, JWT_SECRET, ADMIN_NAME/EMAIL/PASSWORD
   ```

2. **Create the database** (local Postgres):

   ```bash
   createdb rewardsdesk
   ```

3. **Install, migrate, seed:**

   ```bash
   npm run install:all
   npm run migrate
   npm run seed
   ```

4. **Run** — two terminals:

   ```bash
   npm run dev:server   # Express on :3000
   npm run dev:client   # Vite on :5173 (proxies /api -> :3000)
   ```

   Open http://localhost:5173 and sign in with the seeded admin. The guest form is at
   http://localhost:5173/enroll.

## Environment variables

| Var              | Required        | Notes                                                         |
| ---------------- | --------------- | ------------------------------------------------------------- |
| `DATABASE_URL`   | yes             | Postgres connection string.                                   |
| `PGSSL`          | no              | `true` to force TLS (most external managed Postgres).         |
| `JWT_SECRET`     | yes             | Long random string; signs the auth cookie.                    |
| `ADMIN_NAME`     | seed only       | Initial owner account name.                                   |
| `ADMIN_EMAIL`    | seed only       | Initial owner login email.                                    |
| `ADMIN_PASSWORD` | seed only       | Initial owner password (re-seeding resets it).                |
| `NODE_ENV`       | yes (prod)      | `production` enables secure cookies + serves the built app.   |
| `PORT`           | no              | Defaults to `3000`. Railway injects this.                     |
| `CLIENT_ORIGIN`  | dev only        | Vite origin allowed by CORS (default `http://localhost:5173`).|
| `COOKIE_DOMAIN`  | prod (optional) | Domain for the auth cookie.                                   |
| `STRIPE_SECRET_KEY` | parking      | Stripe secret key (`sk_test_…` / `sk_live_…`). App boots without it; parking pay endpoints 503. |
| `STRIPE_WEBHOOK_SECRET` | parking  | Signing secret for `/api/parking/webhook` (CLI and dashboard secrets differ). |
| `PUBLIC_BASE_URL` | parking (prod) | Absolute origin for Stripe success/cancel URLs.               |

## PWA icons

Placeholder icons live in `client/public/icons` and are committed. To regenerate them
(e.g. after a brand change), edit the colors/shape in `client/scripts/generate-icons.js`
and run:

```bash
node client/scripts/generate-icons.js
```

## Deploy (Railway)

A `railway.json` is included — it sets the build command, the start command (which applies
migrations first), and a `/api/health` healthcheck.

1. Create a Railway project and attach a **PostgreSQL** plugin (provides `DATABASE_URL`).
2. Set env vars: `JWT_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `NODE_ENV=production` (and `COOKIE_DOMAIN` if you serve from a custom domain).
3. Connect this repo. Railway reads `railway.json`:
   - **build:** `npm run build` (installs both workspaces, builds the client)
   - **start:** `npm run migrate && npm run seed && npm start` (applies migrations,
     seeds/syncs the owner from the `ADMIN_*` vars, then Express serves `client/dist`
     and exposes `/api`)
   - **healthcheck:** `/api/health`
4. Make sure `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are set **before** the
   first deploy — the start command seeds the owner account from them automatically
   (both migrate and seed are idempotent, so they run safely on every deploy). To change
   the owner login later, update those vars and redeploy.

## Privacy

For rewards, only name, address, phone, and email are stored — never SSNs. For parking,
guest contact/vehicle details are stored but **card data never touches this server** —
Stripe processes every card and we keep only Stripe reference ids. Consent
(boolean + timestamp) is recorded on every guest submission. Prefilled links carry PII and
are only for per-guest sends (Canary/email); printed/wall QR codes stay generic (source
only). The public intake endpoint is honeypot-protected, IP rate-limited, and validated
server-side.
