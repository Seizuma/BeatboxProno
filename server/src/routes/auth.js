import { Router } from 'express';
import crypto from 'node:crypto';
import {
  discordAuthorizeUrl,
  exchangeCode,
  upsertDiscordUser,
  issueSession,
  clearSession,
} from '../lib/auth.js';
import { touch } from '../lib/presence.js';

export const authRouter = Router();

authRouter.get('/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('bbp_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(discordAuthorizeUrl(state));
});

authRouter.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  const home = process.env.PUBLIC_WEB_URL ?? '/';

  if (!code || !state || state !== req.cookies?.bbp_state) {
    return res.redirect(`${home}/?auth=failed`);
  }
  res.clearCookie('bbp_state');

  try {
    const profile = await exchangeCode(String(code));
    const user = await upsertDiscordUser(profile);
    issueSession(res, user);

    // Un passage complet par Discord compte comme une visite du jour. La
    // session vient tout juste d'être ouverte, donc `req.user` était encore
    // vide quand attachUser s'est exécuté : sans cette ligne, la personne ne
    // serait comptée qu'à sa requête suivante. Sans `await` — la fréquentation
    // est une statistique, elle ne doit pas retarder la redirection ni la faire
    // échouer.
    touch(user.id);

    res.redirect(`${home}/me`);
  } catch (err) {
    console.error('[auth]', err.message);
    res.redirect(`${home}/?auth=failed`);
  }
});

authRouter.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, username, globalName, avatarUrl, role } = req.user;
  res.json({ user: { id, username, globalName, avatarUrl, role } });
});