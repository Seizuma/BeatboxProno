import { prisma } from './prisma.js';
import {
    BATTLE_HAPPENED,
    BATTLE_SCORE,
    BATTLE_WINNER,
    GAP_MAX_BONUS,
    QUALIFIED_POINT,
} from './scoring.js';

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

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
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
 * Les points qu'un pronostic PARFAIT obtiendrait sur ce qui est déjà publié.
 *
 * ─── Pourquoi cette fonction existe ──────────────────────────────────────────
 *
 * Le classement affichait auparavant une « réussite en battle » calculée à
 * part : elle ne regardait que les affiches, ignorait complètement les
 * éliminations, et réinventait un barème à côté de celui de `scoring.js`. Deux
 * règles pour dire ce que vaut un pronostic, c'est une de trop.
 *
 * La précision est désormais un simple rapport : points obtenus sur points
 * obtenables. Le dénominateur suit le barème ligne pour ligne, ce qui fait
 * entrer les écarts de placement dans la mesure — quelqu'un qui range tout le
 * monde à une place près marque beaucoup sans rien deviner exactement, et sa
 * précision le dit.
 *
 * ─── « Publié » est la seule condition ───────────────────────────────────────
 *
 * `scorePrediction` saute les phases non résolues : les points n'en viennent
 * jamais. Le maximum doit sauter les mêmes, sans quoi la précision de tout le
 * monde s'effondrerait à mesure qu'on ajoute des compétitions à venir.
 *
 * C'est aussi ce qui corrige un défaut visible : l'ancienne mesure lisait les
 * battles sur `played`, qui reste vrai après une DÉPUBLICATION. Le classement
 * affichait donc une réussite sur des résultats retirés, en face de zéro point.
 * Ici, dépublier une phase la retire des deux côtés du rapport à la fois.
 */
function maxOnResolved(category) {
    let total = 0;

    for (const phase of category.phases ?? []) {
        // La requête filtre déjà sur `resolved`, mais la règle est trop importante
        // pour reposer sur un `where` qu'un jour quelqu'un élargira.
        if (!phase.resolved) continue;

        if (RANKING_TYPES.includes(phase.type)) {
            // Les participants RÉELLEMENT classés, pas les inscrits : une phase
            // publiée avec dix résultats sur vingt ne vaut que dix placements.
            const ranked = (phase.entries ?? []).filter((e) => e.rank != null).length;

            // Le point de qualification n'existe que sur les phases qui éliminent, et
            // seulement si la coupe laisse quelqu'un dehors.
            const countsQualification = phase.type === 'WILDCARD' || phase.type === 'ELIMINATION';
            const cut = phase.qualifierCount ?? 0;
            const qualifies = countsQualification && cut > 0 && cut < ranked ? cut : 0;

            total += ranked * GAP_MAX_BONUS + qualifies * QUALIFIED_POINT;
            continue;
        }

        // Une affiche ne rapporte que si elle a eu lieu ET oppose deux participants
        // connus : c'est la condition d'entrée de `scoreBattlePhase`.
        const battles = (phase.battles ?? []).filter(
            (b) => b.played && b.contenderAId && b.contenderBId
        ).length;

        total += battles * (BATTLE_HAPPENED + BATTLE_WINNER + BATTLE_SCORE);
    }

    return total;
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
        totals: { players: 0, submitted: 0, points: 0, possible: 0, precision: null },
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

    const [grouped, submissions, categories, officialRanks, predictedRanks] = await Promise.all([
        prisma.prediction.groupBy({
            by: ['userId'],
            where: predictionWhere,
            _sum: { points: true },
            _count: { _all: true },
            orderBy: { _sum: { points: 'desc' } },
            take,
        }),

        // Qui a déposé dans quelle catégorie. C'est ce qui borne le dénominateur :
        // on ne reproche à personne les points d'une Loopstation qu'il n'a pas
        // pronostiquée.
        prisma.prediction.findMany({
            where: predictionWhere,
            select: { userId: true, categoryId: true },
        }),

        // Le maximum obtenable, catégorie par catégorie, sur les seules phases
        // publiées.
        prisma.category.findMany({
            where: Object.keys(categoryScope).length ? categoryScope : {},
            select: {
                id: true,
                phases: {
                    where: { resolved: true },
                    select: {
                        type: true,
                        resolved: true,
                        qualifierCount: true,
                        entries: { select: { rank: true } },
                        battles: { select: { played: true, contenderAId: true, contenderBId: true } },
                    },
                },
            },
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

    const maxByCategory = new Map(categories.map((c) => [c.id, maxOnResolved(c)]));

    const categoriesByUser = new Map();
    for (const s of submissions) {
        if (!categoriesByUser.has(s.userId)) categoriesByUser.set(s.userId, new Set());
        categoriesByUser.get(s.userId).add(s.categoryId);
    }

    const possibleFor = (userId) => {
        let total = 0;
        for (const categoryId of categoriesByUser.get(userId) ?? []) {
            total += maxByCategory.get(categoryId) ?? 0;
        }
        return total;
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

    let globalPoints = 0;
    let globalPossible = 0;

    const players = [
        ...grouped.map((g) => {
            const points = g._sum.points ?? 0;
            const possible = possibleFor(g.userId);

            globalPoints += points;
            globalPossible += possible;

            return {
                user: byId.get(g.userId) ?? null,
                predictions: g._count._all,
                points,
                // Ce que le pronostic parfait aurait rapporté sur le même périmètre.
                // Rendu au client pour qu'il affiche « 62 % · 74/120 » : un pourcentage
                // seul ne dit pas s'il repose sur une phase ou sur dix.
                possible,
                // `null` tant que rien n'est publié : zéro pour cent se lirait comme un
                // échec alors que rien n'a encore été joué.
                precision: possible ? Math.round((points / possible) * 100) : null,
            };
        }),
        ...idle.map((id) => ({
            user: byId.get(id) ?? null,
            predictions: 0,
            points: 0,
            possible: 0,
            precision: null,
        })),
    ];

    const totals = {
        players: grouped.length,
        submitted: grouped.reduce((n, g) => n + g._count._all, 0),
        points: globalPoints,
        possible: globalPossible,
        precision: globalPossible ? Math.round((globalPoints / globalPossible) * 100) : null,
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