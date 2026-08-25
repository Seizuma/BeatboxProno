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
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

/**
 * Express 4 avale les rejets d'un handler asynchrone : la requête reste
 * suspendue jusqu'au délai d'expiration, sans une ligne de log. Toute route
 * `async` de ce fichier passe par ici.
 */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * La destination à rejoindre une fois la connexion faite.
 *
 * Un ami qui reçoit un lien d'invitation vers un groupe privé sans être
 * connecté doit revenir sur cette invitation après Discord, pas sur « mes
 * pronostics » — sinon il se retrouve devant une page qui n'a aucun rapport
 * avec ce sur quoi il a cliqué, et abandonne.
 *
 * Seuls les chemins internes sont acceptés. Un paramètre de redirection non
 * filtré est une redirection ouverte : il suffirait de faire circuler
 * « …/auth/discord?next=https://faux-site » pour qu'un lien parfaitement
 * légitime en apparence dépose les gens ailleurs, connectés et en confiance.
 * D'où les trois contrôles : commence par « / », ne commence pas par « // »
 * (qui désigne un autre domaine), et reste court.
 */
function safeReturn(value) {
  const next = String(value ?? '');
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (next.length > 300) return null;
  return next;
}

authRouter.get('/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('bbp_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
  });

  // La destination voyage dans un cookie plutôt que dans le paramètre `state`
  // renvoyé par Discord : `state` sert à vérifier que la réponse répond bien à
  // notre demande, y mêler des données applicatives brouillerait ce rôle.
  const next = safeReturn(req.query.next);
  if (next) {
    res.cookie('bbp_next', next, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
    });
  } else {
    res.clearCookie('bbp_next');
  }

  res.redirect(discordAuthorizeUrl(state));
});

authRouter.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  const home = process.env.PUBLIC_WEB_URL ?? '';

  // Relu depuis le cookie, puis repassé au filtre : un cookie se forge aussi
  // bien qu'un paramètre d'URL.
  const next = safeReturn(req.cookies?.bbp_next) ?? '/me';
  res.clearCookie('bbp_next');

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

    res.redirect(`${home}${next}`);
  } catch (err) {
    console.error('[auth]', err.message);
    res.redirect(`${home}/?auth=failed`);
  }
});

authRouter.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/**
 * La session courante.
 *
 * Les trois cosmétiques portés sont relus en base plutôt que pris sur
 * `req.user` : ce que le middleware attache dépend de son propre `select`, et
 * s'y fier ici ferait dépendre l'affichage du cadre d'un fichier qui n'a rien
 * demandé — le jour où quelqu'un resserre ce select, le cadre disparaîtrait de
 * l'en-tête sans erreur ni trace, ce qui est la pire façon de casser.
 *
 * La requête est un findUnique sur la clé primaire, et `/me` n'est appelé
 * qu'une fois par chargement d'application : le coût est nul à côté du risque.
 */
authRouter.get('/me', guard(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, username, globalName, avatarUrl, role } = req.user;

  const worn = await prisma.user.findUnique({
    where: { id },
    select: { equippedFrame: true, equippedTitle: true, equippedFlair: true },
  });

  res.json({
    user: {
      id,
      username,
      globalName,
      avatarUrl,
      role,
      equippedFrame: worn?.equippedFrame ?? null,
      equippedTitle: worn?.equippedTitle ?? null,
      equippedFlair: worn?.equippedFlair ?? null,
    },
  });
}));