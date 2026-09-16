import { PrismaClient } from '@prisma/client';

/**
 * Le consensus d'un événement, en JSON, pour la fabrique d'images Instagram.
 *
 * ─── Pourquoi un script et pas une route ─────────────────────────────────────
 *
 * Ces agrégats coûtent plusieurs balayages de `PredictedBattle` et de
 * `PredictedRank` par catégorie. Exposés en route publique, ils seraient
 * rejoués à chaque visite d'un carrousel qu'on publie une fois par semaine.
 * Un script lancé à la main, dont la sortie se colle dans une page statique,
 * rend exactement le même service sans rien ajouter à la surface du serveur.
 *
 * ─── Parenté avec `consensus.js` ─────────────────────────────────────────────
 *
 * Les deux répondent à la même question et partagent le vocabulaire des tours
 * et la règle de nommage d'un contender. La différence est la SORTIE :
 * `consensus.js` écrit des tableaux ASCII pour Discord, ce script écrit des
 * données brutes. Fusionner les deux obligerait à faire transiter la mise en
 * forme par un paramètre, ce qui rendrait les deux plus difficiles à lire que
 * la duplication qu'on évite. En revanche, toute correction de la DÉFINITION
 * d'une moyenne doit être portée dans les deux : c'est écrit ici pour qu'on ne
 * l'oublie pas.
 *
 * ─── Ce que « moyen » veut dire, palier par palier ───────────────────────────
 *
 *   — TOP MOYEN : le rang moyen de chacun sur une phase de classement
 *     (wildcards, éliminations). On trie par rang moyen croissant. C'est la
 *     même définition que dans `consensus.js`.
 *
 *   — BRACKET MOYEN : affiche par affiche, la PAIRE la plus pronostiquée et le
 *     VAINQUEUR le plus pronostiqué de cette affiche. La paire est comparée
 *     sans tenir compte du côté — poser A en haut ou en bas est le même
 *     pronostic, et compter les deux dispositions séparément couperait en deux
 *     un consensus qui existe.
 *
 *     Attention à ce que ça n'est PAS : un tableau cohérent. Le vainqueur
 *     modal d'un quart peut ne pas être l'un des deux noms de la demie modale,
 *     parce que chaque case est comptée indépendamment. C'est voulu — forcer
 *     la cohérence reviendrait à inventer un pronostic que personne n'a
 *     déposé. Le pourcentage affiché à côté de chaque vainqueur dit à quel
 *     point la case est tranchée.
 *
 *   — PODIUM MOYEN : le vainqueur le plus pronostiqué de la finale, son
 *     adversaire le plus pronostiqué, et le vainqueur le plus pronostiqué de
 *     la petite finale. Atteindre la finale et la gagner sont deux classements
 *     distincts, et ils diffèrent souvent.
 *
 *   node scripts/instagram.js --event=gbb-2026 > gbb-2026.json
 *   node scripts/instagram.js --latest
 *   node scripts/instagram.js --event=gbb-2026 --drafts   # brouillons compris
 *   node scripts/instagram.js --event=gbb-2026 --cap=20   # lignes du top moyen
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const SUBMITTED_ONLY = !flag('drafts');
const ONLY_EVENT = value('event') ?? null;
// Vingt lignes tiennent sur une image au format 4:5 en restant lisibles à
// hauteur de pouce. Au-delà, la police descend sous le seuil où un nom se lit
// sur un téléphone.
const RANK_CAP = Number(value('cap') ?? 20);
// Sous ce seuil, une « moyenne » n'est que l'avis de deux personnes présenté
// comme une tendance. Même seuil que `consensus.js`.
const MIN_PRONOS = Number(value('min') ?? 5);

const RANKING_TYPES = ['WILDCARD', 'ELIMINATION', 'SEEDING'];
const BRACKET_TYPES = ['BRACKET', 'LEGACY'];

/** L'ordre d'affichage des tours, et leur nom en français. */
const ROUNDS = [
    ['ROUND_OF_32', 'Seizièmes'],
    ['ROUND_OF_16', 'Huitièmes'],
    ['QUARTER', 'Quarts'],
    ['SEMI', 'Demi-finales'],
    ['FINAL', 'Finale'],
];
const ROUND_ORDER = new Map(ROUNDS.map(([r], i) => [r, i]));
const ROUND_LABEL = new Map([...ROUNDS, ['SMALL_FINAL', 'Petite finale'], ['LEGACY', 'Affiches']]);

/* ---------------------------------------------------------------------------
   Les requêtes

   L'agrégation reste en base : ramener toutes les lignes de pronostics pour
   les compter en JavaScript coûterait de plus en plus cher à chaque
   compétition, pour un résultat identique.
   --------------------------------------------------------------------------- */

/**
 * Le nom affiché d'un contender : le sien, sinon celui des artistes rattachés.
 * La règle de `naming.js`, réécrite ici parce que la jointure se fait en SQL —
 * exactement comme dans `consensus.js`.
 */
const NAMES = `
    SELECT ct.id,
           COALESCE(ct.name, STRING_AGG(a.name, ' & ' ORDER BY a.name), '—') AS nom
    FROM "Contender" ct
    LEFT JOIN "ContenderArtist" ca ON ca."contenderId" = ct.id
    LEFT JOIN "Artist" a ON a.id = ca."artistId"
    WHERE ct."categoryId" = $1
    GROUP BY ct.id, ct.name
`;

const PRONOS = `
    SELECT p.id FROM "Prediction" p
    WHERE p."categoryId" = $1 ${SUBMITTED_ONLY ? 'AND p.submitted = true' : ''}
`;

/** Le rang moyen de chaque participant sur une phase de classement. */
function rankingRows(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH noms AS (${NAMES})
        SELECT n.nom,
               AVG(pr.rank)::float8                                         AS moyenne,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pr.rank)::float8 AS mediane,
               COALESCE(STDDEV_SAMP(pr.rank), 0)::float8                    AS ecart,
               COUNT(*)::int                                                AS pronos
        FROM "PredictedRank" pr
        JOIN "Prediction" p ON p.id = pr."predictionId"
            ${SUBMITTED_ONLY ? 'AND p.submitted = true' : ''}
        JOIN noms n ON n.id = pr."contenderId"
        WHERE pr."phaseId" = $2
        GROUP BY n.nom
        ORDER BY moyenne ASC, ecart ASC, n.nom
        `,
        categoryId,
        phaseId
    );
}

/**
 * L'affiche la plus pronostiquée de chaque case du tableau.
 *
 * `LEAST`/`GREATEST` sur les deux identifiants normalise le côté : « A contre
 * B » et « B contre A » sont le même pronostic, et les compter séparément
 * couperait en deux un consensus qui existe.
 *
 * `DISTINCT ON` garde la première ligne de chaque case dans l'ordre demandé —
 * la plus fréquente. C'est l'équivalent Postgres d'un « argmax par groupe »,
 * en une passe au lieu d'une sous-requête corrélée.
 */
function pairRows(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH pronos AS (${PRONOS}),
        total AS (SELECT GREATEST(COUNT(*), 1)::numeric AS n FROM pronos),
        comptes AS (
            SELECT pb.round                                  AS round,
                   pb.slot                                   AS slot,
                   LEAST(pb."contenderAId", pb."contenderBId")    AS un,
                   GREATEST(pb."contenderAId", pb."contenderBId") AS deux,
                   COUNT(*)::int                             AS n
            FROM "PredictedBattle" pb
            JOIN pronos ON pronos.id = pb."predictionId"
            WHERE pb."phaseId" = $2
              AND pb."contenderAId" IS NOT NULL
              AND pb."contenderBId" IS NOT NULL
            GROUP BY 1, 2, 3, 4
        )
        SELECT DISTINCT ON (c.round, c.slot)
               c.round, c.slot, c.un, c.deux, c.n,
               (100 * c.n / t.n)::float8 AS pct
        FROM comptes c CROSS JOIN total t
        ORDER BY c.round, c.slot, c.n DESC, c.un
        `,
        categoryId,
        phaseId
    );
}

/**
 * Le vainqueur le plus pronostiqué de chaque case.
 *
 * Le pourcentage se rapporte aux pronostics qui ont REMPLI la case, pas au
 * total : sur une case que la moitié des gens laisse vide, rapporter au total
 * donnerait 40 % à un vainqueur désigné par huit personnes sur dix.
 */
function winnerRows(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH pronos AS (${PRONOS}),
        comptes AS (
            SELECT pb.round AS round, pb.slot AS slot, pb."winnerId" AS gagnant,
                   COUNT(*)::int AS n,
                   SUM(COUNT(*)) OVER (PARTITION BY pb.round, pb.slot)::int AS remplis
            FROM "PredictedBattle" pb
            JOIN pronos ON pronos.id = pb."predictionId"
            WHERE pb."phaseId" = $2 AND pb."winnerId" IS NOT NULL
            GROUP BY 1, 2, 3
        )
        SELECT DISTINCT ON (round, slot) round, slot, gagnant, n, remplis,
               (100.0 * n / GREATEST(remplis, 1))::float8 AS pct
        FROM comptes
        ORDER BY round, slot, n DESC, gagnant
        `,
        categoryId,
        phaseId
    );
}

/** Le nom de chaque contender de la catégorie, par identifiant. */
async function nameMap(categoryId) {
    const rows = await prisma.$queryRawUnsafe(NAMES, categoryId);
    return new Map(rows.map((r) => [r.id, r.nom]));
}

/* ---------------------------------------------------------------------------
   L'assemblage
   --------------------------------------------------------------------------- */

async function rankingOf(category) {
    for (const phase of category.phases) {
        if (!RANKING_TYPES.includes(phase.type)) continue;
        const rows = await rankingRows(category.id, phase.id);
        if (!rows.length) continue;

        // La coupe de la phase fait le top : vingt qualifiés, top 20. Faute de
        // coupe déclarée, on montre ce qui tient sur l'image.
        const cut = Math.min(phase.qualifierCount ?? rows.length, rows.length, RANK_CAP);
        return {
            phase: phase.name,
            cut,
            rows: rows.slice(0, cut).map((r, i) => ({
                place: i + 1,
                name: r.nom,
                avg: Number(r.moyenne.toFixed(2)),
                median: Number(r.mediane.toFixed(1)),
                sd: Number(r.ecart.toFixed(2)),
            })),
        };
    }
    return null;
}

async function bracketOf(category) {
    for (const phase of category.phases) {
        if (!BRACKET_TYPES.includes(phase.type)) continue;

        const [pairs, winners, names] = await Promise.all([
            pairRows(category.id, phase.id),
            winnerRows(category.id, phase.id),
            nameMap(category.id),
        ]);
        if (!pairs.length) continue;

        const winnerAt = new Map(winners.map((w) => [`${w.round}:${w.slot}`, w]));

        const byRound = new Map();
        for (const p of pairs) {
            if (!byRound.has(p.round)) byRound.set(p.round, []);
            const w = winnerAt.get(`${p.round}:${p.slot}`);
            byRound.get(p.round).push({
                slot: p.slot,
                a: names.get(p.un) ?? '—',
                b: names.get(p.deux) ?? '—',
                pairPct: Math.round(p.pct),
                winner: w ? names.get(w.gagnant) ?? null : null,
                winnerPct: w ? Math.round(w.pct) : null,
            });
        }

        const order = (r) => ROUND_ORDER.get(r) ?? (r === 'SMALL_FINAL' ? 98 : 99);
        const rounds = [...byRound.keys()]
            .sort((a, b) => order(a) - order(b))
            .map((round) => ({
                round,
                label: ROUND_LABEL.get(round) ?? round,
                battles: byRound.get(round).sort((x, y) => x.slot - y.slot),
            }));

        return { phase: phase.name, rounds };
    }
    return null;
}

/**
 * Le podium moyen.
 *
 * Le finaliste malheureux se lit dans la PAIRE de la finale, pas dans un
 * classement séparé : c'est celui des deux noms de l'affiche modale qui n'est
 * pas le vainqueur modal. Quand les deux comptages se contredisent — le
 * vainqueur modal ne figure pas dans la paire modale — on laisse le champ
 * vide plutôt que d'inventer un adversaire.
 */
function podiumOf(bracket) {
    if (!bracket) return null;

    const final = bracket.rounds.find((r) => r.round === 'FINAL')?.battles?.[0] ?? null;
    const small = bracket.rounds.find((r) => r.round === 'SMALL_FINAL')?.battles?.[0] ?? null;
    if (!final?.winner) return null;

    const runnerUp = [final.a, final.b].find((n) => n !== final.winner) ?? null;

    return {
        first: { name: final.winner, pct: final.winnerPct },
        second: runnerUp ? { name: runnerUp, pct: null } : null,
        third: small?.winner ? { name: small.winner, pct: small.winnerPct } : null,
    };
}

async function main() {
    const event = ONLY_EVENT
        ? await prisma.event.findUnique({ where: { slug: ONLY_EVENT } })
        : (
            await prisma.event.findMany({
                where: { status: { not: 'DRAFT' } },
                orderBy: [{ year: 'desc' }, { startsAt: 'desc' }],
                take: 1,
            })
        )[0];

    if (!event) throw new Error(ONLY_EVENT ? `Aucun événement « ${ONLY_EVENT} ».` : 'Aucun événement publié.');

    const categories = await prisma.category.findMany({
        where: { eventId: event.id },
        include: { phases: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
    });

    const out = [];
    for (const category of categories) {
        const count = await prisma.prediction.count({
            where: { categoryId: category.id, ...(SUBMITTED_ONLY ? { submitted: true } : {}) },
        });
        if (count < MIN_PRONOS) {
            console.error(`— ${category.slug} : ${count} pronostic(s), ignorée.`);
            continue;
        }

        const bracket = await bracketOf(category);
        out.push({
            slug: category.slug,
            name: category.name,
            predictions: count,
            ranking: await rankingOf(category),
            bracket,
            podium: podiumOf(bracket),
        });
    }

    const total = await prisma.prediction.count({
        where: { eventId: event.id, ...(SUBMITTED_ONLY ? { submitted: true } : {}) },
    });

    // Le JSON sur la sortie standard, les diagnostics sur l'erreur standard :
    // c'est ce qui permet de rediriger la sortie dans un fichier sans avoir à
    // en retirer les lignes de journal à la main.
    console.log(
        JSON.stringify(
            {
                event: {
                    slug: event.slug,
                    name: `${event.name} ${event.year}`,
                    startsAt: event.startsAt,
                    predictions: total,
                },
                categories: out,
            },
            null,
            2
        )
    );
    console.error(`[instagram] ${out.length} catégorie(s), ${total} pronostic(s).`);
}

main()
    .catch((err) => {
        console.error(err.message ?? err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());