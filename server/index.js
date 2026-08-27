import './env.js';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import authRoutes from './routes/auth.js';
import intakeRoutes from './routes/intake.js';
import parkingPublicRoutes from './routes/parkingPublic.js';
import parkingWebhookRoutes from './routes/parkingWebhook.js';
import parkingRoutes from './routes/parking.js';
import enrollmentRoutes from './routes/enrollments.js';
import statsRoutes from './routes/stats.js';
import exportRoutes from './routes/export.js';
import staffRoutes from './routes/staff.js';
import settingsRoutes from './routes/settings.js';
import promoRoutes from './routes/promos.js';
import { uploadDir, UPLOAD_ROUTE } from './lib/uploads.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const here = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();

// Trust Railway's proxy so req.ip (used by rate limiting) is the real client.
if (isProd) app.set('trust proxy', 1);

if (isProd && (process.env.JWT_SECRET || '').length < 32) {
  console.warn(
    '⚠ JWT_SECRET is short or unset. Use a long random value (e.g. `openssl rand -base64 48`).',
  );
}

// Nothing here was compressed. On the guest parking path that is 192 KiB over
// the wire where gzip sends 70 — roughly 650ms on congested hotel wifi, for a
// page someone is standing outside in the weather to use.
app.use(compression());

// Security headers. CSP only in production (dev pages come from Vite):
// self-hosted scripts, Google Fonts styles/fonts, data: images (QR codes).
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            'script-src': ["'self'"],
            'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:'],
            'connect-src': ["'self'"],
          },
        }
      : false,
  }),
);

// ⚠ The Stripe webhook MUST receive the raw, unparsed body for signature
// verification — this mount must stay ABOVE the global express.json below.
app.use('/api/parking/webhook', express.raw({ type: 'application/json' }), parkingWebhookRoutes);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Dev: the Vite origin calls the API cross-origin with credentials.
// Prod: the API is same-origin (Express serves the SPA), so no CORS needed.
if (!isProd) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', intakeRoutes); // /api/intake
app.use('/api', parkingPublicRoutes); // /api/parking/checkout, /api/parking/session/:token, /api/public/parking-config
app.use('/api/parking', parkingRoutes); // staff/admin: sessions, dashboard
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', promoRoutes); // /api/public/promos, /api/promos (admin)

// Uploaded promo images. Content-hashed names are never reused, so they can be
// cached hard; a missing volume simply yields 404s rather than breaking boot.
app.use(
  UPLOAD_ROUTE,
  express.static(uploadDir, {
    maxAge: '365d',
    immutable: true,
    fallthrough: true,
    index: false,
    dotfiles: 'deny',
  }),
);

// Any unmatched /api/* route is a JSON 404, not the SPA fallback.
app.use('/api', notFound);

// Production: serve the built client and let the SPA handle client-side routes.
if (isProd) {
  const dist = resolve(here, '..', 'client', 'dist');
  if (existsSync(dist)) {
    app.use(
      express.static(dist, {
        setHeaders: (res, filePath) => {
          // Vite fingerprints everything under /assets, so those bytes can
          // never change under a given name — cache them hard. index.html and
          // the service worker must stay revalidated or clients pin to an old
          // build.
          const immutable = /[/\\]assets[/\\]/.test(filePath);
          res.setHeader(
            'Cache-Control',
            immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );

    // One HTML file serves both products, and its static chrome is the
    // white-label one so a guest viewing source on the parking page finds no
    // trace of the staff app. Staff routes get their own title and description
    // swapped in here — doing it with an inline script would be blocked by the
    // CSP above, which allows 'self' scripts only. Read once at boot.
    const baseHtml = readFileSync(join(dist, 'index.html'), 'utf8');
    const guestHtml = baseHtml.replace(/RewardsDesk/g, 'Parking');
    const staffHtml = baseHtml
      .replace('<title>Guest Parking</title>', '<title>RewardsDesk</title>')
      .replace(
        'content="Pay for parking and check your time."',
        'content="Front-desk rewards intake &amp; enrollment tracking."',
      );

    // The lot sign is submitted to carriers as opt-in proof, so both the bare
    // path and the file name resolve to it rather than one 404ing.
    app.get(['/sign', '/sign.png/'], (req, res) => res.redirect(308, '/sign.png'));

    app.get('*', (req, res) => {
      const guest = req.path === '/park' || req.path.startsWith('/park/');
      res.type('html').set('Cache-Control', 'no-cache').send(guest ? guestHtml : staffHtml);
    });
  } else {
    console.warn('client/dist not found — run `npm run build` before starting in production.');
  }
}

app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`RewardsDesk API listening on :${port} (${isProd ? 'production' : 'development'})`);
});
