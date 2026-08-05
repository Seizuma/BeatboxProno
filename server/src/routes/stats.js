import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const statsRouter = Router();

/** Une affiche est identifiée par sa paire de contenders, sans tenir compte du
 *  slot : c'est la même règle que le barème, où prédire Alem vs NaPoM paie même
 *  si l'officiel les fait se croiser dans l'autre moitié du tableau. */
const pairKey = (a, b) => [a, b].filter(Boolean).sort().join('|');
const battleKey = (phaseId, round, a, b) => `${phaseId}:${round}:${pairKey(a, b)}`;

/**
 * Statistiques des joueurs. Le classement dit qui gagne, cette page dit
 * comment : combien de pronostics, combien de points par pronostic, et surtout
 * quelle proportion des battles ont été bien lues.
 *
 * GET /api/stats?event=gbb-2026
 */
statsRouter.get('/stats', async (req, res) => {
  const { event: eventSlug } = req.query;

  let eventId = null;
  if (eventSlug) {
    const ev = await prisma.event.findUnique({ where: { slug: String(eventSlug) } });
    if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
    eventId = ev.id;
  }

  const predictionWhere = { submitted: true, ...(eventId ? { eventId } : {}) };

  const [grouped, battles, picks, favouriteRows] = await Promise.all([
    prisma.prediction.groupBy({
      by: ['userId'],
      where: predictionWhere,
      _sum: { points: true },
      _count: { _all: true },
      orderBy: { _sum: { points: 'desc' } },
      take: 200,
    }),

    prisma.battle.findMany({
      where: {
        played: true,
        winnerId: { not: null },
        ...(eventId ? { phase: { category: { eventId } } } : {}),
      },
      select: { phaseId: true, round: true, contenderAId: true, contenderBId: true, winnerId: true },
    }),

    prisma.predictedBattle.findMany({
      where: { winnerId: { not: null }, prediction: predictionWhere },
      select: {
        phaseId: true,
        round: true,
        contenderAId: true,
        contenderBId: true,
        winnerId: true,
        prediction: { select: { userId: true } },
      },
    }),

    prisma.predictedPodium.groupBy({
      by: ['contenderId'],
      where: { rank: 1, prediction: predictionWhere },
      _count: { _all: true },
      orderBy: { _count: { contenderId: 'desc' } },
      take: 6,
    }),
  ]);

  // --- Réussite en battle, joueur par joueur --------------------------------

  const official = new Map();
  for (const b of battles) {
    official.set(battleKey(b.phaseId, b.round, b.contenderAId, b.contenderBId), b.winnerId);
  }

  const tally = new Map(); // userId → { picks, hits }
  let globalPicks = 0;
  let globalHits = 0;

  for (const pick of picks) {
    const winner = official.get(
      battleKey(pick.phaseId, pick.round, pick.contenderAId, pick.contenderBId)
    );
    if (winner === undefined) continue; // battle pas encore jouée : on ne compte pas

    const userId = pick.prediction.userId;
    const row = tally.get(userId) ?? { picks: 0, hits: 0 };
    row.picks += 1;
    globalPicks += 1;
    if (winner === pick.winnerId) {
      row.hits += 1;
      globalHits += 1;
    }
    tally.set(userId, row);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, username: true, globalName: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const players = grouped.map((g) => {
    const row = tally.get(g.userId) ?? { picks: 0, hits: 0 };
    const count = g._count._all;
    const points = g._sum.points ?? 0;
    return {
      user: byId.get(g.userId) ?? null,
      predictions: count,
      points,
      average: count ? Math.round((points / count) * 10) / 10 : null,
      battlePicks: row.picks,
      battleHits: row.hits,
      accuracy: row.picks ? Math.round((row.hits / row.picks) * 100) : null,
    };
  });

  // --- Les favoris du public -----------------------------------------------

  const favouriteIds = favouriteRows.map((f) => f.contenderId);
  const contenders = favouriteIds.length
    ? await prisma.contender.findMany({
        where: { id: { in: favouriteIds } },
        include: {
          category: { select: { name: true, event: { select: { name: true, year: true } } } },
          artists: { include: { artist: { select: { imageUrl: true } } } },
        },
      })
    : [];
  const contenderById = new Map(contenders.map((c) => [c.id, c]));

  const favourites = favouriteRows
    .map((f) => {
      const c = contenderById.get(f.contenderId);
      if (!c) return null;
      return {
        contenderId: c.id,
        name: c.name,
        category: c.category.name,
        event: `${c.category.event.name} ${c.category.event.year}`,
        imageUrl: c.imageUrl ?? c.artists[0]?.artist?.imageUrl ?? null,
        count: f._count._all,
      };
    })
    .filter(Boolean);

  res.json({
    scope: eventSlug ?? 'general',
    totals: {
      players: grouped.length,
      submitted: grouped.reduce((n, g) => n + g._count._all, 0),
      points: grouped.reduce((n, g) => n + (g._sum.points ?? 0), 0),
      battlesPlayed: battles.length,
      battlePicks: globalPicks,
      accuracy: globalPicks ? Math.round((globalHits / globalPicks) * 100) : null,
    },
    players,
    favourites,
  });
});
