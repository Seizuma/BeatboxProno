import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { attachUser } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { statsRouter } from './routes/stats.js';
import { predictionRouter } from './routes/predictions.js';
import { adminRouter } from './routes/admin.js';
import { photoRouter } from './routes/photos.js';
import { postboxRouter } from './routes/postbox.js';
import { accountRouter } from './routes/account.js';
import { groupRouter } from './routes/groups.js';
import { notificationRouter } from './routes/notifications.js';
import { missingWebhooks } from './lib/discord.js';
import { touch } from './lib/presence.js';
import { scheduleDailyReport } from './jobs/daily-report.js';
import { PHOTO_DIR, UPLOAD_DIR } from './lib/photos.js';

/**
 * Express 4 ne rattrape pas les erreurs des gestionnaires asynchrones : une
 * exception dans un `async (req, res) => …` devient un rejet non géré, et Node
 * 20 termine alors le processus. Le conteneur redémarre, la connexion est
 * coupée en pleine requête, et le navigateur ne reçoit rien — d'où un
 * « serveur injoignable » qui masque complètement l'erreur réelle.
 *
 * On journalise plutôt que de mourir : la requête en cours échoue proprement,
 * les autres continuent d'être servies, et le message part dans les logs.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[api] rejet non géré :', reason);
});

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
// Les photos de beatboxers, montées en lecture seule depuis le projet
// Beatbox-Games. Servies sous /api/ pour passer par le même proxy que le reste :
// aucune règle nginx à ajouter, aucun domaine supplémentaire.
app.use(
  '/api/media/artists',
  express.static(PHOTO_DIR, {
    maxAge: '30d',
    immutable: false,
    fallthrough: true,
    index: false,
    dotfiles: 'ignore',
  })
);

// Les photos téléversées depuis l'administration. Volume distinct et
// inscriptible : le dossier ci-dessus reste en lecture seule. Les noms portent
// un horodatage, donc le cache peut être agressif sans risque de photo périmée.
app.use(
  '/api/media/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '365d',
    immutable: true,
    fallthrough: true,
    index: false,
    dotfiles: 'ignore',
  })
);

app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.use(attachUser);

// La fréquentation quotidienne, notée juste après la résolution de la session.
//
// Posée ici plutôt que dans attachUser : compter les visites n'est pas
// authentifier, et le middleware d'authentification n'a pas à savoir qu'un
// rapport existe. Sans `await` et sans `next` conditionnel — une statistique ne
// doit ni ralentir une requête ni la faire échouer. Une seule écriture par
// personne et par jour, le reste est absorbé par le cache de presence.js.
app.use((req, _res, next) => {
  if (req.user) touch(req.user.id);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api', statsRouter);
app.use('/api/predictions', predictionRouter);
app.use('/api/groups', groupRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/postbox', postboxRouter);
app.use('/api/account', accountRouter);
app.use('/api/admin/photos', photoRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => res.status(404).json({ error: `Route inconnue : ${req.path}` }));

app.use((err, req, res, _next) => {
  // Le chemin et le détail dans les logs : sans eux, une erreur en production
  // se réduit à « le serveur n'a pas pu traiter la demande ».
  console.error(`[api] ${req.method} ${req.originalUrl} —`, err?.message ?? err);
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
app.listen(port, '0.0.0.0', () => {
  console.log(`API prête sur :${port}`);
  console.log(`Photos artistes lues dans ${PHOTO_DIR}`);
  console.log(`Photos téléversées dans ${UPLOAD_DIR}`);

  // Un webhook oublié ne se voit qu'au premier message envoyé, c'est-à-dire
  // trop tard. On le dit au démarrage.
  const missing = missingWebhooks();
  if (missing.length) {
    console.warn(
      `[postbox] webhook Discord absent pour : ${missing.join(', ')} — ces messages seront enregistrés mais pas relayés.`
    );
  }

  scheduleDailyReport();
});