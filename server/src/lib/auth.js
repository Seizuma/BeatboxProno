/* ===========================================================================
   ⚠️  FICHIER RECONSTITUÉ

   Ce fichier ne figurait pas dans la copie du projet dont je disposais. Il a
   été réécrit à partir de ses appelants (routes/auth.js, predictions.js,
   admin.js, public.js) pour que le dépôt soit complet et démarre.

   Si vous avez toujours votre version d'origine, GARDEZ-LA : elle contient vos
   réglages réels. Comparez avant d'écraser.
   =========================================================================== */

import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';

const COOKIE = 'bbp_session';
const MAX_AGE_DAYS = 30;

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET manquant : impossible de signer une session.');
  return value;
};

const bootstrapAdmins = () =>
  (process.env.BOOTSTRAP_ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// --- OAuth2 Discord -----------------------------------------------------------

export function discordAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: process.env.DISCORD_REDIRECT_URI ?? '',
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

/** Échange le code contre un jeton, puis lit le profil. Scope `identify` seul. */
export async function exchangeCode(code) {
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI ?? '',
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Discord a refusé l'échange du code (${tokenRes.status}).`);
  }
  const { access_token: accessToken } = await tokenRes.json();

  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error(`Profil Discord illisible (${meRes.status}).`);

  return meRes.json();
}

/** Crée ou rafraîchit le compte local. Le tout premier inscrit est admin. */
export async function upsertDiscordUser(profile) {
  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
    : null;

  const existing = await prisma.user.findUnique({ where: { discordId: profile.id } });

  if (!existing) {
    const count = await prisma.user.count();
    const promoted = count === 0 || bootstrapAdmins().includes(profile.id);
    return prisma.user.create({
      data: {
        discordId: profile.id,
        username: profile.username,
        globalName: profile.global_name ?? null,
        avatarUrl,
        role: promoted ? 'ADMIN' : 'USER',
      },
    });
  }

  return prisma.user.update({
    where: { id: existing.id },
    data: {
      username: profile.username,
      globalName: profile.global_name ?? null,
      avatarUrl,
      lastSeenAt: new Date(),
    },
  });
}

// --- Session ------------------------------------------------------------------

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id }, secret(), { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Pose `req.user` s'il y a une session valide. N'échoue jamais. */
export async function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();

  try {
    const { sub } = jwt.verify(token, secret());
    req.user = await prisma.user.findUnique({ where: { id: sub } });
  } catch {
    req.user = null; // cookie périmé ou trafiqué : on continue en anonyme
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connectez-vous pour continuer.' });
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Connectez-vous pour continuer.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Vous n'avez pas les droits pour cette action." });
    }
    return next();
  };
}
