import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withName } from '../lib/naming.js';

export const publicRouter = Router();

const isStaff = (user) => Boolean(user) && ['ADMIN', 'OWNER'].includes(user.role);

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
    // seedPairs reste exposé : c'est le FORMAT du tableau, pas un résultat.
    // Le joueur doit savoir qui affrontera qui avant de classer ses wildcards,
    // sinon il compose à l'aveugle.
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

  /**
   * La censure ne s'applique pas aux organisateurs.
   *
   * Elle existe pour empêcher qu'un résultat saisi mais pas encore publié
   * fuite vers les joueurs. Appliquée à l'administrateur lui-même, elle lui
   * renvoyait ses propres classements avec `rank: null` — l'éditeur de tableau
   * ne trouvait donc aucun qualifié et refusait de composer le premier tour
   * tant que les éliminations n'étaient pas publiées.
   *
   * C'est exactement l'inverse du besoin : on prépare le tableau AVANT de
   * publier, pour vérifier qu'il tient debout. La page événement rend donc les
   * données brutes au staff, comme elle lui rend déjà les événements en
   * brouillon.
   */
  res.json({
    event: isStaff(req.user) ? event : redactEvent(event),
    myPredictions,
  });
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

  /**
   * Les compteurs suivent le statut de l'ÉVÉNEMENT, jamais `scoredAt`.
   *
   * `scoredAt` dit « ce pronostic est passé par le calculateur », ce qui n'est
   * pas la même chose que « son résultat est connu ». Il se pose au gré des
   * recalculs, donc au gré des manipulations d'organisateur : deux personnes du
   * même événement affichaient des états différents selon le moment où elles
   * avaient déposé. La question posée à l'écran — « où en est mon pronostic ? »
   * — se répond avec l'état de la compète, pas avec un horodatage technique.
   *
   *   déposés  : tous les pronostics déposés, compète en cours ou terminée
   *   attente  : déposés dont la compète n'est pas terminée
   *   terminés : déposés dont la compète l'est
   *   brouillons : jamais déposés
   */
  const totals = predictions.reduce(
    (acc, p) => {
      if (!p.submitted) {
        acc.drafts += 1;
        return acc;
      }
      acc.submitted += 1;
      acc.points += p.points;
      if (p.event.status === 'FINISHED') acc.finished += 1;
      else acc.pending += 1;
      return acc;
    },
    { points: 0, submitted: 0, finished: 0, pending: 0, drafts: 0 }
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

  const categoryIds = [...new Set(artist.entries.map((e) => e.contender.categoryId))];

  const [battles, picks, podiumSlots, scored] = await Promise.all([
    // Les battles officielles JOUÉES où il apparaît. Elles servent au palmarès
    // et au dénominateur de la fiabilité, pas au décompte des pronostics.
    prisma.battle.findMany({
      where: {
        played: true,
        OR: [{ contenderAId: { in: contenderIds } }, { contenderBId: { in: contenderIds } }],
      },
      select: {
        phaseId: true, round: true, contenderAId: true, contenderBId: true, winnerId: true,
      },
    }),

    /**
     * Les fois où quelqu'un l'a donné vainqueur d'une battle.
     *
     * Une seule condition : le pronostic doit avoir été DÉPOSÉ. Chacun peut
     * garder dix brouillons par catégorie, et les compter revenait à mesurer le
     * nombre de fois où quelqu'un avait hésité.
     *
     * Ce qu'il ne faut SURTOUT pas exiger en plus, c'est que l'affiche existe
     * déjà officiellement. Une première version le faisait, et le compteur
     * tombait à zéro sur toute compétition à venir : avant le tirage, aucune
     * battle n'est en base, donc aucun pronostic ne pouvait « correspondre ».
     * Or c'est précisément avant la compète que la question intéresse — qui la
     * foule voit-elle gagner ?
     */
    prisma.predictedBattle.findMany({
      where: { winnerId: { in: contenderIds }, prediction: { submitted: true } },
      select: { round: true, phaseId: true, contenderAId: true, contenderBId: true, winnerId: true },
    }),

    // Le palmarès réel de l'artiste — ses vrais podiums, pas un pari. Plus
    // affiché sur la fiche, mais conservé : il alimente le décompte de
    // participations et ne coûte qu'une requête sur une table minuscule.
    prisma.podiumSlot.findMany({ where: { contenderId: { in: contenderIds } } }),

    /**
     * Le détail de score des pronostics déjà confrontés aux résultats, dans les
     * catégories où il concourt. C'est de là que sortent les points marqués
     * grâce à lui.
     *
     * Restreint à ses catégories : sans ce filtre, la requête ramènerait le
     * détail de tous les pronostics du site pour n'en garder qu'une poignée.
     */
    categoryIds.length
      ? prisma.prediction.findMany({
        where: { categoryId: { in: categoryIds }, submitted: true, scoredAt: { not: null } },
        select: { breakdown: true },
      })
      : [],
  ]);

  const wins = battles.filter((b) => contenderIds.includes(b.winnerId)).length;

  /**
   * La lecture que la foule fait de lui AVANT que rien ne soit joué.
   *
   * La fiabilité ne peut rien dire tant qu'aucune battle n'a été disputée : sur
   * une compétition à venir, elle affichait un tiret et n'apprenait rien. Or
   * c'est justement à ce moment-là qu'on vient voir une fiche d'artiste.
   *
   * Deux chiffres disponibles dès le premier pronostic déposé : la part des
   * pronostiqueurs qui le voient passer la coupe, et le rang moyen qu'ils lui
   * donnent. Le second départage les artistes que tout le monde qualifie —
   * être qualifié par 95 % ne dit pas si on est vu premier ou huitième.
   */
  const placements = await prisma.predictedRank.findMany({
    where: { contenderId: { in: contenderIds }, prediction: { submitted: true } },
    select: { rank: true, phase: { select: { qualifierCount: true } } },
  });

  let cutSeen = 0;
  let cutThrough = 0;
  let rankSum = 0;
  for (const placement of placements) {
    rankSum += placement.rank;
    // Sans coupe déclarée, la phase ne qualifie personne : la compter fausserait
    // la part dans les deux sens selon les compétitions.
    const cut = placement.phase?.qualifierCount;
    if (!cut) continue;
    cutSeen += 1;
    if (placement.rank <= cut) cutThrough += 1;
  }

  /**
   * Les points que les pronostiqueurs ont marqués sur des lignes où il figure.
   *
   * Le barème attribue ses points à des lignes : un placement en classement,
   * une affiche de bracket. On additionne celles qui le mentionnent — le
   * placement qu'on lui a donné, et les battles où il apparaît d'un côté ou de
   * l'autre. C'est la lecture littérale de « points gagnés grâce à lui », et
   * elle ne demande aucun recalcul : le détail est déjà en base.
   *
   * Les points d'une affiche sont comptés en entier, sans les répartir entre
   * les deux adversaires : une battle bien lue l'est grâce aux deux, et couper
   * en deux produirait des demi-points que personne ne saurait interpréter.
   */
  const owned = new Set(contenderIds);
  let pointsFrom = 0;
  for (const { breakdown } of scored) {
    if (!Array.isArray(breakdown)) continue;
    for (const section of breakdown) {
      for (const line of section?.lines ?? []) {
        const mentions =
          owned.has(line.contenderId) ||
          owned.has(line.contenderAId) ||
          owned.has(line.contenderBId);
        if (mentions) pointsFrom += line.points ?? 0;
      }
    }
  }

  /**
   * Fiabilité : parmi les battles JOUÉES où quelqu'un l'a donné vainqueur,
   * quelle proportion s'est réalisée ?
   *
   * Le dénominateur exclut les pronostics portant sur des affiches pas encore
   * disputées — les compter ferait chuter le taux à chaque compète annoncée,
   * alors que rien n'a encore été tranché.
   */
  const playedByKey = new Map(
    battles.map((b) => [
      `${b.phaseId}:${b.round}:${[b.contenderAId, b.contenderBId].sort().join('|')}`,
      b,
    ])
  );

  let judged = 0;
  let correct = 0;
  for (const pick of picks) {
    const hit = playedByKey.get(
      `${pick.phaseId}:${pick.round}:${[pick.contenderAId, pick.contenderBId].sort().join('|')}`
    );
    if (!hit) continue;
    judged += 1;
    if (hit.winnerId === pick.winnerId) correct += 1;
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
    record: {
      battlesPlayed: battles.length,
      wins,
      losses: battles.length - wins,
      podiums: podiumSlots.length,
      // Les points que la foule a marqués sur des lignes où il figure.
      pointsFrom,
    },
    crowd: {
      timesPickedToWinBattle: picks.length,
      pickedAndRight: correct,
      accuracy: judged ? Math.round((correct / judged) * 100) : null,
      judged,
      // Part des placements qui le mettent dans les qualifiés, et rang moyen
      // qu'on lui donne. Disponibles dès le premier pronostic déposé.
      qualifiedShare: cutSeen ? Math.round((cutThrough / cutSeen) * 100) : null,
      averageRank: placements.length
        ? Math.round((rankSum / placements.length) * 10) / 10
        : null,
      placements: placements.length,
    },
  });
});