import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { attachUser } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { predictionRouter } from './routes/predictions.js';
import { adminRouter } from './routes/admin.js';

const app = express();
app.set('trust proxy', 1); // derrière Nginx Proxy Manager

app.use(
  cors({
    origin: process.env.PUBLIC_WEB_URL ?? true,
    credentials: true,
  })
);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api/predictions', predictionRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => res.status(404).json({ error: `Route inconnue : ${req.path}` }));

app.use((err, _req, res, _next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Données invalides.', details: err.flatten() });
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'Cet élément existe déjà.' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Élément introuvable.' });
  }
  console.error('[api]', err);
  res.status(500).json({ error: "Le serveur n'a pas pu traiter la demande." });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => console.log(`API prête sur :${port}`));
