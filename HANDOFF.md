# RewardsDesk — Production Handoff Checklist

Everything the hotel needs to own and operate the app: rewards + guest parking.

## 1. Accounts the hotel must own at handoff

| Asset | Where | Notes |
| --- | --- | --- |
| GitHub repository | github.com | Transfer the repo (or add the owner as admin). Source of truth for all code. |
| Railway project | railway.com | Hosting + Postgres. Transfer project ownership to the hotel's account. |
| Stripe account | stripe.com | The hotel's own Stripe account receives all parking revenue. |
| Custom domain | registrar | e.g. `parking.hotelname.com` or one domain for both products. |
| Admin login | the app | An owner-controlled admin user (Staff page manages the rest). |
| Env values | Railway → Variables | Copies kept somewhere safe (password manager). |

## 2. Railway environment variables (production)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (attached plugin reference) |
| `JWT_SECRET` | long random string (`openssl rand -base64 48`) |
| `NODE_ENV` | `production` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | owner login (seed refuses weak/default passwords) |
| `STRIPE_SECRET_KEY` | `sk_live_…` (test: `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the **dashboard webhook endpoint** (see below) |
| `PUBLIC_BASE_URL` | `https://<your-domain>` — used in Stripe success/cancel URLs |
| `COOKIE_DOMAIN` | only if using a custom domain for the app |

Migrations and seed run automatically on every deploy (idempotent).

## 3. Stripe setup (one-time)

1. Create/activate the hotel's Stripe account (business details, bank account for payouts).
2. **Test first**: use `sk_test_…` keys, pay with card `4242 4242 4242 4242`.
3. Create a **webhook endpoint** in the Stripe dashboard (live mode):
   - URL: `https://<your-domain>/api/parking/webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
   - Copy its signing secret into `STRIPE_WEBHOOK_SECRET`. ⚠ The Stripe **CLI's**
     `whsec_` (used for local dev) is a different value and will NOT work in production.
4. Enable customer receipt emails: Stripe dashboard → Settings → Emails → "Successful payments".

## 4. Test → live switch checklist

- [ ] `STRIPE_SECRET_KEY` → `sk_live_…`
- [ ] Live webhook endpoint created at the production URL; `STRIPE_WEBHOOK_SECRET` → its secret
- [ ] `PUBLIC_BASE_URL` → the real domain
- [ ] Redeploy, then run **one real card test**: pay for 1 hour of parking, confirm the
      status page activates, the receipt email arrives, and the payment shows in Stripe
- [ ] Refund that test payment from the app (Sessions → payment → Refund) and confirm it
      lands in Stripe and in the session's audit trail
- [ ] Print the real lot QR codes (QR & links → Parking signs) and scan one with a phone

## 5. Custom domain

1. Railway → service → Settings → Domains → add `<your-domain>`.
2. Add the CNAME at the registrar as instructed by Railway.
3. Update `PUBLIC_BASE_URL` (and `COOKIE_DOMAIN` if used) and redeploy.
4. Re-print QR codes after the domain changes (they embed the URL).

## 6. Backups & recovery

- Railway Postgres supports backups from the plugin's page — confirm they're enabled
  and note the retention. For a manual snapshot: `pg_dump $DATABASE_URL > backup.sql`.
- Restore: `psql $DATABASE_URL < backup.sql` (empty database), then redeploy.
- The repo (GitHub) is the recovery source for all code and config-as-code.

## 7. Operations quick reference

- **Add/remove front-desk staff** — Staff page (admin). Deactivation locks them out immediately.
- **Change parking rates/capacity/brand/lots** — Parking Settings (admin). Rate changes
  affect new purchases only.
- **Change hotel timezone / rewards goals / sources** — Settings (admin).
- **Data retention** — Settings → Data retention purges old processed rewards records.
- **Bulk exports** — Enrollments → Export CSV (rewards); Parking Overview → Export CSV (parking). Admin-only.
- **Refunds** — Sessions → open session → Refund on the payment row. Admin-only, reason required.

## 8. What this app never does

- Never stores card numbers (Stripe hosts all card entry; we keep only Stripe ids).
- Never enrolls anyone in Best Western Rewards (front desk completes it on the BW terminal).
- Never sends SMS/email itself (Stripe sends payment receipts; a future SMS app can link
  guests to `/park` using the documented prefill URL params).
