import './env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

import authRoutes from './routes/auth.js';
import intakeRoutes from './routes/intake.js';
import enrollmentRoutes from './routes/enrollments.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const here = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();

// Trust Railway's proxy so req.ip (used by rate limiting) is the real client.
if (isProd) app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Dev: the Vite origin calls the API cross-origin with credentials.
// Prod: the API is same-origin (Express serves the SPA), so no CORS needed.
if (!isProd) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', intakeRoutes); // /api/intake, /api/public/config
app.use('/api/enrollments', enrollmentRoutes);
// (stats + admin routers are mounted in later phases)

// Any unmatched /api/* route is a JSON 404, not the SPA fallback.
app.use('/api', notFound);

// Production: serve the built client and let the SPA handle client-side routes.
if (isProd) {
  const dist = resolve(here, '..', 'client', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(join(dist, 'index.html')));
  } else {
    console.warn('client/dist not found — run `npm run build` before starting in production.');
  }
}

app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`RewardsDesk API listening on :${port} (${isProd ? 'production' : 'development'})`);
});
