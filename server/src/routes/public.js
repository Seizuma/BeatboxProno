import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withName } from '../lib/naming.js';

export const publicRouter = Router();

const visible = (user) =>
  user && ['ADMIN', 'OWNER'].includes(user.role)
    ? {}
    : { status: { not: 'DRAFT' } };

/** L'ordre des tours d'un tableau, pour retrouver celui qui ouvre la phase. */
const MAIN_LINE = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];

/**
 * Ce qu'une phase montre aux joueurs tant qu'elle n'est pas PUBLIÉE.
 *
 * L'administration promet que tant qu'on n'a pas cliqué « Publier », « rien
 * n'est encore visible des joueurs ». Ce n'était pas vrai : la route renvoyait
 * les affiches officielles telles quelles, vainqueurs compris. Pire, les
 * affiches des tours aval sont composées automatiquement à partir des
 * résultats saisis — enregistrer les quarts remplissait les demi-finales
 * officielles, et cette composition partait au joueur. Elle lui révélait le
 * résultat réel ET gelait son arbre : son propre vainqueur de quart ne montait
 * plus en demie.
 *
 * On ne laisse donc passer que le squelette, plus le tirage du premier tour —
 * lui est public, il est connu avant que rien ne se joue.
 */
function redactPhase(phase, drawPublished = true) {
  if (phase.resolved) return phase;

  const rounds = new Set((phase.battles ?? []).map((b) => b.round));
  // Le tirage du premier tour n'est public qu'une fois la qualification jouée.
  // Avant, les appariements en base sont ceux que l'éditeur d'organisateur
  // compose seul à partir du classement officiel : ils révèlent qui est qualifié
  // et s'imposent à l'arbre du joueur alors qu'ils ne sont le tirage de personne.
  const firstRound = drawPublished ? MAIN_LINE.find((r) => rounds.has(r)) ?? null : null;

  return {
    ...phase,
    // Un classement saisi mais pas publié est un résultat comme un autre.
    entries: (phase.entries ?? []).map((e) => ({ ...e, rank: null, qualified: false })),
    battles: (phase.battles ?? []).map((b) => ({
      id: b.id,
      phaseId: b.phaseId,
      round: b.round,
      slot: b.slot,
      label: b.label,
      // Les affiches Legacy sont composées à la main, sans tour amont : elles
      // ne trahissent aucun résultat, on les garde.
      contenderAId: b.round === firstRound || b.round === 'LEGACY' ? b.contenderAId : null,
      contenderBId: b.round === firstRound || b.round === 'LEGACY' ? b.contenderBId : null,
      winnerId: null,
      scoreA: null,
      scoreB: null,
      played: false,
    })),
  };
}

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];

/**
 * Applique la redaction à toutes les phases d'un événement.
 *
 * La décision se prend au niveau de la CATÉGORIE, pas de la phase : savoir si
 * le tirage d'un tableau est public suppose de regarder la qualification qui
 * l'alimente, laquelle est une autre phase.
 */
function redactEvent(event) {
  for (const category of event.categories ?? []) {
    const phases = category.phases ?? [];
    const qualifying = [...phases].filter((p) => RANKING_TYPES.includes(p.type)).pop();
    const drawPublished = !qualifying || Boolean(qualifying.resolved);
    category.phases = phases.map((p) => redactPhase(p, drawPublished));
  }
  return event;
}

const categoryInclude = {
  contenders: {
    include: { artists: { include: { artist: true } } },
    orderBy: { seed: 'asc' },
  },
  phases: {
    orderBy: { position: 'asc' },
    include: {
      entries: { orderBy: { rank: 'asc' } },
      battles: { orderBy: [{ round: 'asc' }, { slot: 'asc' }] },
    },
  },
};

publicRouter.get('/events', async (req, res) => {
  const events = await prisma.event.findMany({
    where: visible(req.user),
    orderBy: [{ startsAt: 'desc' }, { year: 'desc' }],
    include: {
      categories: { orderBy: { position: 'asc' }, select: { id: true, name: true, slug: true, kind: true } },
      // Uniquement les pronostics déposés : les brouillons sont privés, et les
      // compter gonflait le compteur public de l'accueil.
      _count: { select: { predictions: { where: { submitted: true } } } },
    },
  });
  res.json({ events });
});

publicRouter.get('/events/:slug', async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { slug: req.params.slug, ...visible(req.user) },
    include: {
      categories: { orderBy: { position: 'asc' }, include: categoryInclude },
    },
  });
  if (!event) return res.status(404).json({ error: 'Événement introuvable.' });

  let myPredictions = [];
  if (req.user) {
    // Toutes mes versions, pas seulement la déposée : la page événement laisse
    // basculer de l'une à l'autre.
    myPredictions = await prisma.prediction.findMany({
      where: { userId: req.user.id, eventId: event.id },
      include: { ranks: true, battles: true },
      orderBy: [{ submitted: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  // Les noms se résolvent ici, une fois pour toutes : le client n'a pas à
  // savoir qu'un participant peut suivre son artiste.
  for (const category of event.categories) {
    category.contenders = category.contenders.map(withName);
  }

  res.json({ event: redactEvent(event), myPredictions });
});

/**
 * Le détail d'un pronostic, lisible par tout le monde.
 *
 * Deux conditions : le pronostic doit avoir été DÉPOSÉ — un brouillon reste
 * privé, sans quoi on lirait les hésitations des autres — et son événement doit
 * être visible. Le propriétaire, lui, accède aussi à ses propres brouillons.
 */
publicRouter.get('/predictions/:predictionId', async (req, res) => {
  const prediction = await prisma.prediction.findUnique({
    where: { id: req.params.predictionId },
    include: {
      user: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
      event: { select: { slug: true, name: true, year: true, status: true, judgeCount: true } },
      category: {
        select: {
          name: true,
          kind: true,
          phases: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, type: true, resolved: true, qualifierCount: true },
          },
          contenders: {
            select: {
              id: true,
              name: true,
              seed: true,
              imageUrl: true,
              artists: { select: { artist: { select: { name: true, imageUrl: true } } } },
            },
          },
        },
      },
      ranks: true,
      battles: true,
    },
  });

  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  const mine = req.user?.id === prediction.userId;
  if (!mine && !prediction.submitted) {
    return res.status(403).json({ error: "Ce brouillon n'est pas public." });
  }
  if (prediction.event.status === 'DRAFT' && !['ADMIN', 'OWNER'].includes(req.user?.role)) {
    return res.status(404).json({ error: 'Pronostic introuvable.' });
  }

  prediction.category.contenders = prediction.category.contenders.map(withName);
  res.json({ prediction });
});

/** Classement général ou par événement. */
publicRouter.get('/leaderboard', async (req, res) => {
  const { event: eventSlug } = req.query;

  const where = { submitted: true };
  if (eventSlug) {
    const ev = await prisma.event.findUnique({ where: { slug: String(eventSlug) } });
    if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
    where.eventId = ev.id;
  }

  const rows = await prisma.prediction.groupBy({
    by: ['userId'],
    where,
    _sum: { points: true },
    _count: { _all: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 200,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, username: true, globalName: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  res.json({
    scope: eventSlug ?? 'general',
    leaderboard: rows.map((r, i) => ({
      position: i + 1,
      user: byId.get(r.userId),
      points: r._sum.points ?? 0,
      predictions: r._count._all,
    })),
  });
});

/** Fiche publique d'un pronostiqueur. */
publicRouter.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true, globalName: true, avatarUrl: true, createdAt: true, role: true },
  });
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const predictions = await prisma.prediction.findMany({
    where: { userId: user.id, ...(req.user?.id === user.id ? {} : { submitted: true }) },
    include: {
      event: { select: { slug: true, name: true, year: true, status: true } },
      category: { select: { name: true, slug: true, kind: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const totals = predictions.reduce(
    (acc, p) => {
      if (!p.submitted) acc.drafts += 1;
      else if (p.scoredAt) {
        acc.finished += 1;
        acc.points += p.points;
      } else acc.pending += 1;
      return acc;
    },
    { points: 0, finished: 0, pending: 0, drafts: 0 }
  );

  res.json({ user, predictions, totals });
});

/**
 * Stats d'un artiste : sur combien de pronostics les gens l'ont vu gagner,
 * et à quelle fréquence ils ont eu raison.
 */
publicRouter.get('/artists', async (_req, res) => {
  const artists = await prisma.artist.findMany({ orderBy: { name: 'asc' } });
  res.json({ artists });
});

publicRouter.get('/artists/:slug', async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { slug: req.params.slug },
    include: {
      entries: {
        include: {
          contender: {
            include: { category: { include: { event: true } } },
          },
        },
      },
    },
  });
  if (!artist) return res.status(404).json({ error: 'Artiste introuvable.' });

  const contenderIds = artist.entries.map((e) => e.contenderId);

  const [battles, predictedWins, podiumSlots] = await Promise.all([
    prisma.battle.findMany({
      where: {
        played: true,
        OR: [{ contenderAId: { in: contenderIds } }, { contenderBId: { in: contenderIds } }],
      },
    }),
    prisma.predictedBattle.count({ where: { winnerId: { in: contenderIds } } }),
    // Le palmarès réel de l'artiste — ses vrais podiums, pas un pari.
    prisma.podiumSlot.findMany({ where: { contenderId: { in: contenderIds } } }),
  ]);

  const wins = battles.filter((b) => contenderIds.includes(b.winnerId)).length;

  // Fiabilité : parmi les battles jouées où quelqu'un l'a donné vainqueur,
  // quelle proportion s'est réalisée ?
  const playedIds = new Set(battles.map((b) => b.id));
  const picks = await prisma.predictedBattle.findMany({
    where: { winnerId: { in: contenderIds } },
    select: { round: true, phaseId: true, contenderAId: true, contenderBId: true, winnerId: true },
  });
  let correct = 0;
  for (const pick of picks) {
    const hit = battles.find(
      (b) =>
        b.phaseId === pick.phaseId &&
        b.round === pick.round &&
        [b.contenderAId, b.contenderBId].sort().join() ===
        [pick.contenderAId, pick.contenderBId].sort().join()
    );
    if (hit && hit.winnerId === pick.winnerId) correct += 1;
  }

  res.json({
    artist: { id: artist.id, slug: artist.slug, name: artist.name, country: artist.country, imageUrl: artist.imageUrl, bio: artist.bio },
    appearances: artist.entries.map((e) => ({
      event: e.contender.category.event.name,
      eventSlug: e.contender.category.event.slug,
      category: e.contender.category.name,
      contender: e.contender.name,
      seed: e.contender.seed,
    })),
    record: { battlesPlayed: battles.length, wins, losses: battles.length - wins, podiums: podiumSlots.length },
    crowd: {
      timesPickedToWinBattle: predictedWins,
      pickedAndRight: correct,
      accuracy: picks.length ? Math.round((correct / picks.length) * 100) : null,
      _playedBattles: playedIds.size,
    },
  });
});