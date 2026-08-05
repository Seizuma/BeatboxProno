import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const publicRouter = Router();

const visible = (user) =>
  user && ['ADMIN', 'MODERATOR'].includes(user.role)
    ? {}
    : { status: { not: 'DRAFT' } };

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
      _count: { select: { predictions: true } },
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

  const podiums = await prisma.podiumSlot.findMany({
    where: { categoryId: { in: event.categories.map((c) => c.id) } },
    orderBy: { rank: 'asc' },
  });
  for (const c of event.categories) {
    c.podium = podiums.filter((p) => p.categoryId === c.id);
  }

  let myPredictions = [];
  if (req.user) {
    myPredictions = await prisma.prediction.findMany({
      where: { userId: req.user.id, eventId: event.id },
      include: { ranks: true, battles: true, podium: true },
    });
  }

  res.json({ event, myPredictions });
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

  const [battles, predictedWins, podiumSlots, predictedPodium] = await Promise.all([
    prisma.battle.findMany({
      where: {
        played: true,
        OR: [{ contenderAId: { in: contenderIds } }, { contenderBId: { in: contenderIds } }],
      },
    }),
    prisma.predictedBattle.count({ where: { winnerId: { in: contenderIds } } }),
    prisma.podiumSlot.findMany({ where: { contenderId: { in: contenderIds } } }),
    prisma.predictedPodium.groupBy({
      by: ['rank'],
      where: { contenderId: { in: contenderIds } },
      _count: { _all: true },
    }),
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
      podiumPicks: predictedPodium.map((p) => ({ rank: p.rank, count: p._count._all })),
      _playedBattles: playedIds.size,
    },
  });
});
