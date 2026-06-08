# RewardsDesk

A guest-intake and enrollment-tracking web app for a hotel front desk.

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
  name, property code, goals, sources), and QR + prefilled-link tools.
- **PWA** — installable, offline-aware (Workbox), branded manifest + icons.

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

- Node.js **20+**
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
   - **start:** `npm run migrate && npm start` (applies migrations, then Express serves
     `client/dist` and exposes `/api`)
   - **healthcheck:** `/api/health`
4. After the first deploy, seed the owner account once (Railway shell or a one-off command):

   ```bash
   npm run seed
   ```

   Migrations run automatically on every deploy (they're idempotent); seeding is a one-time step.

## Privacy

Only name, address, phone, and email are stored — never payment data or SSNs. Consent
(boolean + timestamp) is recorded on every guest submission. Prefilled links carry PII and
are only for per-guest sends (Canary/email); printed/wall QR codes stay generic (source
only). The public intake endpoint is honeypot-protected, IP rate-limited, and validated
server-side.
