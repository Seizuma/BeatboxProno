import { prisma } from './prisma.js';

/**
 * Le moteur du classement.
 *
 * Ce calcul vivait dans `routes/stats.js`, où il servait une seule page. Les
 * groupes privés demandent exactement le même travail sur un sous-ensemble de
 * joueurs et de compétitions : le copier aurait créé deux barèmes qui divergent
 * au premier ajustement. Il sort donc de la route, qui n'a plus qu'à lire ses
 * paramètres et rendre le résultat.
 *
 * Rien n'est écrit ici : une fonction pure de la base, comme `lib/scoring.js`
 * l'est du pronostic.
 */

/**
 * Une affiche est identifiée par sa paire de contenders, sans tenir compte du
 * slot : c'est la même règle que le barème, où prédire Alem vs NaPoM paie même
 * si l'officiel les fait se croiser dans l'autre moitié du tableau.
 */
const pairKey = (a, b) => [a, b].filter(Boolean).sort().join('|');
const battleKey = (phaseId, round, a, b) => `${phaseId}:${round}:${pairKey(a, b)}`;

const KINDS = ['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'LEGACY'];

/**
 * Traduit les paramètres d'URL en identifiants.
 *
 * Renvoie `{ notFound: true }` plutôt que de lever : l'appelant sait mieux que
 * ce module quel code HTTP correspond à un événement inconnu.
 */
export async function resolveScope({ event, kind } = {}) {
    let eventId = null;

    if (event) {
        const found = await prisma.event.findUnique({ where: { slug: String(event) } });
        if (!found) return { notFound: true };
        eventId = found.id;
    }

    return {
        eventId,
        categoryKind: KINDS.includes(String(kind)) ? String(kind) : null,
        eventSlug: event ?? null,
    };
}

/**
 * Le classement, ses totaux et — sur demande — les lectures de la foule.
 *
 * @param {string|null}   eventId       restreint à un événement (site entier)
 * @param {string[]|null} eventIds      restreint à ces événements (périmètre
 *                                      d'un groupe). Une liste vide donne un
 *                                      classement vide, jamais « tous ».
 * @param {string|null}   categoryKind  restreint à un format de catégorie
 * @param {string[]|null} userIds       restreint à ces personnes (un groupe)
 * @param {boolean}       pad           fait figurer à zéro les `userIds` qui
 *                                      n'ont encore rien déposé
 * @param {boolean}       readings      calcule les palmarès de lecture
 * @param {number}        take          nombre de lignes maximum
 */
export async function buildScoreboard({
    eventId = null,
    eventIds = null,
    categoryKind = null,
    userIds = null,
    pad = false,
    readings = true,
    take = 200,
} = {}) {
    const empty = {
        totals: { players: 0, submitted: 0, points: 0, battlesPlayed: 0, battlePicks: 0, accuracy: null },
        players: [],
        readings: { wellRead: [], overRated: [], underRated: [], sampled: 0 },
    };

    // Un groupe sans membre, ou sans périmètre : cinq requêtes pour rendre du
    // vide n'apprendraient rien à personne. Et surtout, une liste d'événements
    // vide ne doit JAMAIS être traitée comme « tous » — c'est exactement le
    // glissement que le périmètre explicite existe pour empêcher.
    if ((userIds && userIds.length === 0) || (eventIds && eventIds.length === 0)) {
        return { ...empty, players: pad ? [] : [] };
    }

    const eventFilter = eventIds ? { eventId: { in: eventIds } } : eventId ? { eventId } : {};
    const categoryEventFilter = eventIds
        ? { eventId: { in: eventIds } }
        : eventId
            ? { eventId }
            : {};

    const predictionWhere = {
        submitted: true,
        ...eventFilter,
        // Filtrer par format : « qui lit le mieux les crews » n'est pas la même
        // question que « qui marque le plus ».
        ...(categoryKind ? { category: { kind: categoryKind } } : {}),
        ...(userIds ? { userId: { in: userIds } } : {}),
    };

    // Le même périmètre, exprimé côté phases.
    const categoryScope = {
        ...categoryEventFilter,
        ...(categoryKind ? { kind: categoryKind } : {}),
    };
    const phaseScope = Object.keys(categoryScope).length ? { category: categoryScope } : {};

    const [grouped, battles, picks, officialRanks, predictedRanks] = await Promise.all([
        prisma.prediction.groupBy({
            by: ['userId'],
            where: predictionWhere,
            _sum: { points: true },
            _count: { _all: true },
            orderBy: { _sum: { points: 'desc' } },
            take,
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
        // Inutile quand les lectures ne sont pas demandées.
        readings
            ? prisma.phaseEntry.findMany({
                where: { phase: { resolved: true, ...phaseScope } },
                select: { phaseId: true, contenderId: true, rank: true },
            })
            : [],

        readings
            ? prisma.predictedRank.findMany({
                where: { prediction: predictionWhere },
                select: { phaseId: true, contenderId: true, rank: true },
            })
            : [],
    ]);

    // --- Réussite en battle, joueur par joueur --------------------------------

    const officialWinners = new Map();
    for (const b of battles) {
        officialWinners.set(battleKey(b.phaseId, b.round, b.contenderAId, b.contenderBId), b.winnerId);
    }

    const tally = new Map(); // userId → { picks, hits }
    let globalPicks = 0;
    let globalHits = 0;

    for (const pick of picks) {
        const winner = officialWinners.get(
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

    // Les inactifs d'un groupe figurent quand même au tableau. Sur le classement
    // général, faire apparaître les milliers de comptes qui n'ont jamais rien
    // déposé n'aurait aucun sens ; dans un cercle de huit, l'absent est une
    // information.
    const scored = new Set(grouped.map((g) => g.userId));
    const idle = pad && userIds ? userIds.filter((id) => !scored.has(id)) : [];

    const users = await prisma.user.findMany({
        where: { id: { in: [...scored, ...idle] } },
        select: { id: true, username: true, globalName: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const players = [
        ...grouped.map((g) => {
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
        }),
        ...idle.map((id) => ({
            user: byId.get(id) ?? null,
            predictions: 0,
            points: 0,
            average: null,
            battlePicks: 0,
            battleHits: 0,
            accuracy: null,
        })),
    ];

    const totals = {
        players: grouped.length,
        submitted: grouped.reduce((n, g) => n + g._count._all, 0),
        points: grouped.reduce((n, g) => n + (g._sum.points ?? 0), 0),
        battlesPlayed: battles.length,
        battlePicks: globalPicks,
        accuracy: globalPicks ? Math.round((globalHits / globalPicks) * 100) : null,
    };

    if (!readings) {
        return { totals, players, readings: { wellRead: [], overRated: [], underRated: [], sampled: 0 } };
    }

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

    const rows = [];
    for (const entry of officialRanks) {
        const bucket = predictedByKey.get(`${entry.phaseId}:${entry.contenderId}`);
        // Sous 3 avis, la moyenne ne veut rien dire : on écarte.
        if (!bucket || bucket.n < 3) continue;
        const expected = bucket.sum / bucket.n;
        rows.push({
            contenderId: entry.contenderId,
            actual: entry.rank,
            expected: Math.round(expected * 10) / 10,
            // Positif : il a fini MIEUX que prévu. Négatif : moins bien.
            delta: Math.round((expected - entry.rank) * 10) / 10,
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
        const contenderById = new Map(contenders.map((c) => [c.id, c]));
        return list
            .map((r) => {
                const c = contenderById.get(r.contenderId);
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

    const byAccuracy = [...rows].sort((x, y) => Math.abs(x.delta) - Math.abs(y.delta));
    const bySurprise = [...rows].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

    const [wellRead, overRated, underRated] = await Promise.all([
        // Les mieux lus : l'écart le plus faible entre attendu et réel.
        decorate(byAccuracy.slice(0, 5)),
        // Surcotés : on les attendait haut, ils ont fini bas (delta négatif).
        decorate(bySurprise.filter((r) => r.delta < 0).slice(0, 5)),
        // Sous-cotés : on les attendait bas, ils ont fini haut (delta positif).
        decorate(bySurprise.filter((r) => r.delta > 0).slice(0, 5)),
    ]);

    return {
        totals,
        players,
        readings: { wellRead, overRated, underRated, sampled: rows.length },
    };
}

/** Les formats de catégorie ayant déjà existé, pour alimenter les filtres. */
export async function scoreboardFilters() {
    const [events, kinds] = await Promise.all([
        prisma.event.findMany({
            where: { status: { not: 'DRAFT' } },
            select: { slug: true, name: true, year: true },
            orderBy: [{ year: 'desc' }, { name: 'asc' }],
        }),
        prisma.category.groupBy({ by: ['kind'], _count: { _all: true } }),
    ]);

    return {
        events,
        kinds: kinds.map((k) => ({ kind: k.kind, categories: k._count._all })),
    };
}