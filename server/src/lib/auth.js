import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';

const COOKIE = 'bbp_session';
const SECRET = process.env.JWT_SECRET;
const TTL_DAYS = 30;

if (!SECRET) throw new Error('JWT_SECRET manquant dans l environnement');

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, SECRET, {
    expiresIn: `${TTL_DAYS}d`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_DAYS * 24 * 3600 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Attache req.user si un cookie valide est présent. Ne bloque jamais. */
export async function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (user) {
      req.user = user;
      prisma.user
        .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }
  } catch {
    /* cookie expiré ou trafiqué : on continue en anonyme */
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connectez-vous pour continuer.' });
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Connectez-vous pour continuer.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Votre compte n'a pas accès à cette section." });
    }
    next();
  };
}

// --- Échange OAuth2 Discord ---------------------------------------------------

const DISCORD_API = 'https://discord.com/api/v10';

export function discordAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
  });

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) throw new Error(`Discord a refusé le code (${tokenRes.status})`);
  const { access_token } = await tokenRes.json();

  const meRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) throw new Error(`Profil Discord illisible (${meRes.status})`);
  return meRes.json();
}

export async function upsertDiscordUser(profile) {
  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
    : null;

  // Le tout premier compte connecté devient admin : évite d'aller bidouiller la base.
  const isFirst = (await prisma.user.count()) === 0;
  const bootstrapAdmins = (process.env.BOOTSTRAP_ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const shouldBeAdmin = isFirst || bootstrapAdmins.includes(profile.id);

  return prisma.user.upsert({
    where: { discordId: profile.id },
    create: {
      discordId: profile.id,
      username: profile.username,
      globalName: profile.global_name ?? null,
      avatarUrl,
      role: shouldBeAdmin ? 'ADMIN' : 'USER',
    },
    update: {
      username: profile.username,
      globalName: profile.global_name ?? null,
      avatarUrl,
      ...(shouldBeAdmin ? { role: 'ADMIN' } : {}),
    },
  });
}
