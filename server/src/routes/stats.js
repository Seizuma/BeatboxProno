import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const statsRouter = Router();

/**
 * Relaie les erreurs d'un gestionnaire asynchrone vers le middleware d'erreur.
 * Sans cela, une exception devient un rejet non géré : le processus tombe et le
 * navigateur voit une connexion coupée plutôt qu'un message.
 */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

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
/** Les formats de catégorie ayant déjà existé, pour alimenter les filtres. */
statsRouter.get('/stats/filters', guard(async (_req, res) => {
  const [events, kinds] = await Promise.all([
    prisma.event.findMany({
      where: { status: { not: 'DRAFT' } },
      select: { slug: true, name: true, year: true },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
    }),
    prisma.category.groupBy({ by: ['kind'], _count: { _all: true } }),
  ]);

  res.json({
    events,
    kinds: kinds.map((k) => ({ kind: k.kind, categories: k._count._all })),
  });
}));

statsRouter.get('/stats', guard(async (req, res) => {
  const { event: eventSlug, kind } = req.query;

  let eventId = null;
  if (eventSlug) {
    const ev = await prisma.event.findUnique({ where: { slug: String(eventSlug) } });
    if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
    eventId = ev.id;
  }

  const KINDS = ['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'LEGACY'];
  const categoryKind = KINDS.includes(String(kind)) ? String(kind) : null;

  const predictionWhere = {
    submitted: true,
    ...(eventId ? { eventId } : {}),
    // Filtrer par format : « qui lit le mieux les crews » n'est pas la même
    // question que « qui marque le plus ».
    ...(categoryKind ? { category: { kind: categoryKind } } : {}),
  };

  // Le même périmètre, exprimé côté phases.
  const phaseScope = {
    ...(eventId || categoryKind
      ? {
        category: {
          ...(eventId ? { eventId } : {}),
          ...(categoryKind ? { kind: categoryKind } : {}),
        },
      }
      : {}),
  };

  const [grouped, battles, picks, officialRanks, predictedRanks] = await Promise.all([
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
        ...(Object.keys(phaseScope).length ? { phase: phaseScope } : {}),
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

    // Le classement officiel de chaque phase résolue, avec les places
    // pronostiquées correspondantes : de quoi mesurer qui la foule a bien lu.
    prisma.phaseEntry.findMany({
      where: {
        phase: { resolved: true, ...phaseScope },
      },
      select: { phaseId: true, contenderId: true, rank: true },
    }),

    prisma.predictedRank.findMany({
      where: { prediction: predictionWhere },
      select: { phaseId: true, contenderId: true, rank: true },
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

  // --- Précision et upsets --------------------------------------------------
  //
  // Pour chaque contender d'une phase résolue, on compare sa place réelle à la
  // moyenne des places que les pronostiqueurs lui donnaient. L'écart dit deux
  // choses : les artistes que la foule lit juste, et ceux qu'elle se trompe le
  // plus à placer — les upsets, dans les deux sens.
  const predictedByKey = new Map();
  for (const r of predictedRanks) {
    const key = `${r.phaseId}:${r.contenderId}`;
    const bucket = predictedByKey.get(key) ?? { sum: 0, n: 0 };
    bucket.sum += r.rank;
    bucket.n += 1;
    predictedByKey.set(key, bucket);
  }

  const readings = [];
  for (const official of officialRanks) {
    const bucket = predictedByKey.get(`${official.phaseId}:${official.contenderId}`);
    // Sous 3 avis, la moyenne ne veut rien dire : on écarte.
    if (!bucket || bucket.n < 3) continue;
    const expected = bucket.sum / bucket.n;
    readings.push({
      contenderId: official.contenderId,
      actual: official.rank,
      expected: Math.round(expected * 10) / 10,
      // Positif : il a fini MIEUX que prévu. Négatif : moins bien.
      delta: Math.round((expected - official.rank) * 10) / 10,
      voters: bucket.n,
    });
  }

  const decorate = async (list) => {
    const ids = list.map((r) => r.contenderId);
    if (ids.length === 0) return [];
    const contenders = await prisma.contender.findMany({
      where: { id: { in: ids } },
      include: {
        category: { select: { name: true, event: { select: { name: true, year: true } } } },
        artists: { include: { artist: { select: { imageUrl: true } } } },
      },
    });
    const byId = new Map(contenders.map((c) => [c.id, c]));
    return list
      .map((r) => {
        const c = byId.get(r.contenderId);
        if (!c) return null;
        return {
          ...r,
          name: c.name,
          category: c.category.name,
          event: `${c.category.event.name} ${c.category.event.year}`,
          imageUrl: c.imageUrl ?? c.artists[0]?.artist?.imageUrl ?? null,
        };
      })
      .filter(Boolean);
  };

  const byAccuracy = [...readings].sort((x, y) => Math.abs(x.delta) - Math.abs(y.delta));
  const bySurprise = [...readings].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const [wellRead, overRated, underRated] = await Promise.all([
    // Les mieux lus : l'écart le plus faible entre attendu et réel.
    decorate(byAccuracy.slice(0, 5)),
    // Surcotés : on les attendait haut, ils ont fini bas (delta négatif).
    decorate(bySurprise.filter((r) => r.delta < 0).slice(0, 5)),
    // Sous-cotés : on les attendait bas, ils ont fini haut (delta positif).
    decorate(bySurprise.filter((r) => r.delta > 0).slice(0, 5)),
  ]);

  res.json({
    scope: { event: eventSlug ?? null, kind: categoryKind },
    totals: {
      players: grouped.length,
      submitted: grouped.reduce((n, g) => n + g._count._all, 0),
      points: grouped.reduce((n, g) => n + (g._sum.points ?? 0), 0),
      battlesPlayed: battles.length,
      battlePicks: globalPicks,
      accuracy: globalPicks ? Math.round((globalHits / globalPicks) * 100) : null,
    },
    players,
    readings: { wellRead, overRated, underRated, sampled: readings.length },
  });
}));