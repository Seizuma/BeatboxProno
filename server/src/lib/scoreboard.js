import { prisma } from './prisma.js';

/**
 * Le moteur du classement.
 *
 * Ce calcul vivait dans `routes/stats.js`, où il servait une seule page. Les
 * groupes privés demandent exactement le même travail sur un sous-ensemble de
 * joueurs et de compétitions : le copier aurait créé deux barèmes qui divergent
 * au premier ajustement.
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

    // Un groupe sans membre, ou sans périmètre. Une liste d'événements vide ne
    // doit JAMAIS être traitée comme « tous » — c'est le glissement que le
    // périmètre explicite existe pour empêcher.
    if ((userIds && userIds.length === 0) || (eventIds && eventIds.length === 0)) return empty;

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

    const categoryScope = {
        ...categoryEventFilter,
        ...(categoryKind ? { kind: categoryKind } : {}),
    };
    const phaseScope = Object.keys(categoryScope).length ? { category: categoryScope } : {};

    const [grouped, battles, picks, submissions, officialRanks, predictedRanks] = await Promise.all([
        prisma.prediction.groupBy({
            by: ['userId'],
            where: predictionWhere,
            _sum: { points: true },
            _count: { _all: true },
            orderBy: { _sum: { points: 'desc' } },
            take,
        }),

        // Les battles officielles jouées du périmètre, avec la catégorie à laquelle
        // elles appartiennent : c'est elle qui dit à qui la question se pose.
        prisma.battle.findMany({
            where: {
                played: true,
                winnerId: { not: null },
                ...(Object.keys(phaseScope).length ? { phase: phaseScope } : {}),
            },
            select: {
                phaseId: true,
                round: true,
                contenderAId: true,
                contenderBId: true,
                winnerId: true,
                phase: { select: { categoryId: true } },
            },
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

        // Qui a déposé dans quelle catégorie. Sans cette liste, impossible de
        // distinguer « il s'est trompé » de « il ne jouait pas cette catégorie ».
        prisma.prediction.findMany({
            where: predictionWhere,
            select: { userId: true, categoryId: true },
        }),

        // Le classement officiel de chaque phase résolue, avec les places
        // pronostiquées correspondantes : de quoi mesurer qui la foule a bien lu.
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

    // --- Réussite en battle -----------------------------------------------------
    //
    // L'ancienne définition comptait, parmi les affiches qu'une personne avait
    // correctement APPARIÉES, la part dont elle avait aussi trouvé le vainqueur.
    // Elle était incohérente, et dans le mauvais sens : quelqu'un qui se trompe
    // sur tout le tableau n'apparie presque rien, son dénominateur fond, et les
    // une ou deux affiches qu'il a devinées lui donnent 100 %. Le pronostiqueur
    // le plus imprudent finissait le plus « fiable ».
    //
    // La nouvelle question est celle qu'on se pose vraiment : sur les battles
    // réellement disputées des catégories où j'ai déposé, combien en ai-je
    // appelées correctement ? Une affiche mal appariée est alors une erreur
    // comptée comme telle, ce qu'elle est.
    //
    // Le dénominateur reste limité aux catégories où la personne a joué : lui
    // reprocher les battles d'une Loopstation qu'elle n'a pas pronostiquée
    // n'aurait aucun sens.

    const battlesByCategory = new Map();
    for (const b of battles) {
        const key = b.phase.categoryId;
        if (!battlesByCategory.has(key)) battlesByCategory.set(key, []);
        battlesByCategory.get(key).push(b);
    }

    const categoriesByUser = new Map();
    for (const s of submissions) {
        if (!categoriesByUser.has(s.userId)) categoriesByUser.set(s.userId, new Set());
        categoriesByUser.get(s.userId).add(s.categoryId);
    }

    const picksByUser = new Map();
    for (const pick of picks) {
        const userId = pick.prediction.userId;
        if (!picksByUser.has(userId)) picksByUser.set(userId, new Map());
        picksByUser
            .get(userId)
            .set(battleKey(pick.phaseId, pick.round, pick.contenderAId, pick.contenderBId), pick.winnerId);
    }

    const record = (userId) => {
        const cats = categoriesByUser.get(userId);
        if (!cats) return { played: 0, hits: 0 };

        const mine = picksByUser.get(userId) ?? new Map();
        let played = 0;
        let hits = 0;

        for (const categoryId of cats) {
            for (const b of battlesByCategory.get(categoryId) ?? []) {
                played += 1;
                const guess = mine.get(battleKey(b.phaseId, b.round, b.contenderAId, b.contenderBId));
                if (guess && guess === b.winnerId) hits += 1;
            }
        }

        return { played, hits };
    };

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

    let globalPlayed = 0;
    let globalHits = 0;

    const players = [
        ...grouped.map((g) => {
            const row = record(g.userId);
            globalPlayed += row.played;
            globalHits += row.hits;

            const count = g._count._all;
            const points = g._sum.points ?? 0;
            return {
                user: byId.get(g.userId) ?? null,
                predictions: count,
                points,
                // `battlePicks` porte désormais le nombre de battles JOUÉES qui le
                // concernaient, pas le nombre de ses paris retenus : c'est le
                // dénominateur affiché sous la jauge.
                battlePicks: row.played,
                battleHits: row.hits,
                accuracy: row.played ? Math.round((row.hits / row.played) * 100) : null,
            };
        }),
        ...idle.map((id) => ({
            user: byId.get(id) ?? null,
            predictions: 0,
            points: 0,
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
        battlePicks: globalPlayed,
        accuracy: globalPlayed ? Math.round((globalHits / globalPlayed) * 100) : null,
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