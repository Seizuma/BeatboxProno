import { Router } from 'express';
import crypto from 'node:crypto';
import {
  discordAuthorizeUrl,
  exchangeCode,
  upsertDiscordUser,
  issueSession,
  clearSession,
} from '../lib/auth.js';

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
    return res.redirect(`${home}/?auth=echec`);
  }
  res.clearCookie('bbp_state');

  try {
    const profile = await exchangeCode(String(code));
    const user = await upsertDiscordUser(profile);
    issueSession(res, user);
    res.redirect(`${home}/moi`);
  } catch (err) {
    console.error('[auth]', err.message);
    res.redirect(`${home}/?auth=echec`);
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
