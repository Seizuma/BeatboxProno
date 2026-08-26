import { PrismaClient } from '@prisma/client';
import { postEmbeds } from '../src/lib/discord.js';

/**
 * Le consensus des pronostiqueurs, palier par palier, posté dans le salon.
 *
 * ─── Ce qu'on appelle « le top 8 moyen » ─────────────────────────────────────
 *
 * Il n'y a pas UNE moyenne mais une par palier, et chacune répond à une question
 * différente :
 *
 *   — un CLASSEMENT pronostiqué (wildcards, éliminations) se moyenne rang par
 *     rang. Le top N est celui de la coupe de la phase : vingt qualifiés, top 20.
 *
 *   — un TABLEAU ne se moyenne pas, il se compte. « Le top 8 moyen du bracket »,
 *     ce sont les huit que les pronostiqueurs envoient le plus souvent EN
 *     QUARTS — donc les huit qui apparaissent le plus dans une affiche de ce
 *     tour. Même chose pour le top 4 en demies, les deux de la petite finale,
 *     les deux de la finale.
 *
 *   — le VAINQUEUR est encore autre chose : ce n'est pas qui atteint la finale,
 *     c'est qui la gagne. Deux classements distincts, et ils diffèrent souvent —
 *     un favori unanime jusqu'en finale peut n'être sacré par personne.
 *
 * ─── Un palier n'est publié que s'il apprend quelque chose ───────────────────
 *
 * Sur un tableau au tirage figé, chaque participant du premier tour y figure
 * dans cent pour cent des pronostics : le classement serait une liste
 * d'ex æquo. Ce tour-là est écarté — mais seulement dans ce cas précis, parce
 * qu'il redevient très informatif dès que le tirage découle du classement que
 * chacun a pronostiqué.
 *
 *   node scripts/consensus.js --dry-run            # tout, sans rien poster
 *   node scripts/consensus.js                      # tous les événements publiés
 *   node scripts/consensus.js --event=gbb-2026
 *   node scripts/consensus.js --category=solo
 *   node scripts/consensus.js --latest             # le dernier événement seul
 *   node scripts/consensus.js --drafts             # brouillons compris
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DRY = flag('dry-run');
// Un brouillon n'est pas un pronostic : par défaut on ne compte que le déposé.
const SUBMITTED_ONLY = !flag('drafts');
const ONLY_EVENT = value('event') ?? null;
const ONLY_CATEGORY = value('category')?.toLowerCase() ?? null;
// Un classement de plus d'une trentaine de lignes ne se lit plus dans un salon.
const RANK_CAP = Number(value('cap') ?? 32);
// Sous ce seuil, une « moyenne » n'est que l'avis de deux personnes présenté
// comme une tendance.
const MIN_PRONOS = Number(value('min') ?? 5);

/* ---------------------------------------------------------------------------
   Le vocabulaire des tours
   --------------------------------------------------------------------------- */

const ROUNDS = [
    ['ROUND_OF_32', 'Seizièmes'],
    ['ROUND_OF_16', 'Huitièmes'],
    ['QUARTER', 'Quarts'],
    ['SEMI', 'Demi-finales'],
    ['SMALL_FINAL', 'Petite finale'],
    ['FINAL', 'Finale'],
    ['LEGACY', 'Affiches'],
];
const ROUND_ORDER = new Map(ROUNDS.map(([r], i) => [r, i]));
const ROUND_LABEL = new Map(ROUNDS);

/* ---------------------------------------------------------------------------
   Les requêtes.

   L'agrégation reste en base, comme pour le rapport de fréquentation : ramener
   toutes les lignes de pronostics pour les compter en JavaScript coûterait de
   plus en plus cher à chaque compétition, pour un résultat identique.
   --------------------------------------------------------------------------- */

/**
 * Le nom affiché d'un contender : le sien, sinon celui du ou des artistes
 * rattachés — la règle de `naming.js`, réécrite ici parce que la jointure se
 * fait en SQL.
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
               AVG(pr.rank)::float8                                         AS valeur,
               COALESCE(STDDEV_SAMP(pr.rank), 0)::float8                    AS ecart,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pr.rank)::float8 AS mediane,
               COUNT(*)::int                                                AS pronos
        FROM "PredictedRank" pr
        JOIN "Prediction" p ON p.id = pr."predictionId"
            ${SUBMITTED_ONLY ? 'AND p.submitted = true' : ''}
        JOIN noms n ON n.id = pr."contenderId"
        WHERE pr."phaseId" = $2
        GROUP BY n.nom
        ORDER BY valeur ASC, ecart ASC, n.nom
        `,
        categoryId,
        phaseId
    );
}

/**
 * Combien de fois chacun est envoyé dans chaque tour.
 *
 * Le `LATERAL VALUES` déplie les deux colonnes de l'affiche en deux lignes :
 * être le camp A ou le camp B, c'est être là. Sans ce dépliage il faudrait deux
 * requêtes et une union pour dire la même chose.
 */
function reachRows(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH pronos AS (${PRONOS}),
        total AS (SELECT GREATEST(COUNT(*), 1)::numeric AS n FROM pronos),
        noms AS (${NAMES}),
        presence AS (
            SELECT pb.round AS round, v.cid AS cid, COUNT(*)::int AS n
            FROM "PredictedBattle" pb
            JOIN pronos ON pronos.id = pb."predictionId"
            CROSS JOIN LATERAL (VALUES (pb."contenderAId"), (pb."contenderBId")) AS v(cid)
            WHERE pb."phaseId" = $2 AND v.cid IS NOT NULL
            GROUP BY 1, 2
        )
        SELECT pr.round, n.nom, pr.n, (100 * pr.n / t.n)::float8 AS pct
        FROM presence pr
        JOIN noms n ON n.id = pr.cid
        CROSS JOIN total t
        ORDER BY pr.round, pr.n DESC, n.nom
        `,
        categoryId,
        phaseId
    );
}

/** Combien de fois chacun GAGNE la finale et la petite finale. */
function winnerRows(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH pronos AS (${PRONOS}),
        total AS (SELECT GREATEST(COUNT(*), 1)::numeric AS n FROM pronos),
        noms AS (${NAMES})
        SELECT pb.round,
               n.nom,
               COUNT(*)::int                              AS n,
               (100 * COUNT(*) / MIN(t.n))::float8        AS pct
        FROM "PredictedBattle" pb
        JOIN pronos ON pronos.id = pb."predictionId"
        JOIN noms n ON n.id = pb."winnerId"
        CROSS JOIN total t
        WHERE pb."phaseId" = $2
          AND pb.round IN ('FINAL', 'SMALL_FINAL')
          AND pb."winnerId" IS NOT NULL
        GROUP BY pb.round, n.nom
        ORDER BY pb.round, n DESC, n.nom
        `,
        categoryId,
        phaseId
    );
}

/* ---------------------------------------------------------------------------
   La mise en forme
   --------------------------------------------------------------------------- */

const BAR = 10;
const bar = (part) => {
    const filled = Math.max(0, Math.min(BAR, Math.round(part * BAR)));
    return '█'.repeat(filled) + '·'.repeat(BAR - filled);
};

/** Largeur de la colonne des noms : jamais plus étroite que son intitulé. */
const nameWidth = (rows) => Math.min(20, Math.max(11, ...rows.map((r) => r.nom.length)));

const cut = (nom, width) => (nom.length > width ? `${nom.slice(0, width - 1)}…` : nom.padEnd(width));

export function renderRanking(rows) {
    const width = nameWidth(rows);
    const head = `    ${'PARTICIPANT'.padEnd(width)}   RANG  MÉDIANE  ÉCART`;
    const lines = rows.map(
        (r, i) =>
            `${String(i + 1).padStart(2)}. ${cut(r.nom, width)}  ` +
            `${r.valeur.toFixed(2).padStart(5)}  ${r.mediane.toFixed(1).padStart(7)}  ` +
            `${r.ecart.toFixed(2).padStart(5)}`
    );
    return ['```', head, '─'.repeat(head.length), ...lines, '```'].join('\n');
}

export function renderShare(rows) {
    const width = nameWidth(rows);
    const head = `    ${'PARTICIPANT'.padEnd(width)}  PART  RÉPARTITION`;
    const lines = rows.map(
        (r, i) =>
            `${String(i + 1).padStart(2)}. ${cut(r.nom, width)}  ` +
            `${`${Math.round(r.pct)}%`.padStart(4)}  ${bar(r.pct / 100)}`
    );
    return ['```', head, '─'.repeat(head.length), ...lines, '```'].join('\n');
}

/* ---------------------------------------------------------------------------
   Les paliers d'une catégorie
   --------------------------------------------------------------------------- */

/**
 * Un tour dont tout le monde est certain n'a rien à dire : autant de lignes à
 * cent pour cent qu'il y a de places. C'est le cas d'un premier tour au tirage
 * figé, et de lui seul.
 */
const unanimous = (rows, slots) =>
    rows.length === slots && rows.every((r) => Math.round(r.pct) >= 100);

export async function stagesFor(category) {
    const stages = [];

    // 1. Les classements pronostiqués, dans l'ordre des phases.
    for (const phase of category.phases) {
        if (!['WILDCARD', 'ELIMINATION', 'SEEDING'].includes(phase.type)) continue;

        const rows = await rankingRows(category.id, phase.id);
        if (!rows.length) continue;

        const cutoff = Math.min(phase.qualifierCount ?? rows.length, rows.length, RANK_CAP);
        stages.push({
            title: `Top ${cutoff} moyen — ${phase.name}`,
            body: renderRanking(rows.slice(0, cutoff)),
            note:
                "L'écart-type dit si c'est un consensus ou deux camps qui se moyennent.",
        });
    }

    // 2. Le tableau, tour par tour.
    for (const phase of category.phases) {
        if (!['BRACKET', 'LEGACY'].includes(phase.type)) continue;

        const slotsOf = new Map();
        for (const b of phase.battles ?? []) slotsOf.set(b.round, (slotsOf.get(b.round) ?? 0) + 2);

        const byRound = new Map();
        for (const r of await reachRows(category.id, phase.id)) {
            if (!byRound.has(r.round)) byRound.set(r.round, []);
            byRound.get(r.round).push(r);
        }

        const rounds = [...byRound.keys()].sort(
            (a, b) => (ROUND_ORDER.get(a) ?? 99) - (ROUND_ORDER.get(b) ?? 99)
        );

        for (const round of rounds) {
            const slots = slotsOf.get(round) ?? 2;
            const rows = byRound.get(round).slice(0, Math.max(slots, 2));
            if (unanimous(rows, slots)) continue;

            const label = ROUND_LABEL.get(round) ?? round;
            stages.push({
                title: `Top ${slots} moyen — ${label}`,
                body: renderShare(rows),
                note: `Part des pronostics qui envoient chacun en ${label.toLowerCase()}.`,
            });
        }

        // 3. Atteindre la finale et la gagner sont deux choses différentes.
        const winners = await winnerRows(category.id, phase.id);
        for (const [round, title] of [
            ['SMALL_FINAL', 'Troisième place moyenne'],
            ['FINAL', 'Vainqueur moyen'],
        ]) {
            const rows = winners.filter((w) => w.round === round).slice(0, 5);
            if (!rows.length) continue;
            stages.push({
                title,
                body: renderShare(rows),
                note: 'Part des pronostics qui le désignent vainqueur de cette affiche.',
            });
        }
    }

    return stages;
}

/* ---------------------------------------------------------------------------
   Le parcours
   --------------------------------------------------------------------------- */

async function targets() {
    const events = ONLY_EVENT
        ? await prisma.event.findMany({ where: { slug: ONLY_EVENT } })
        : await prisma.event.findMany({
            // Un brouillon est invisible du public : son consensus n'existe pas.
            where: { status: { not: 'DRAFT' } },
            orderBy: [{ year: 'desc' }, { startsAt: 'desc' }],
            ...(flag('latest') ? { take: 1 } : {}),
        });

    if (!events.length) {
        throw new Error(ONLY_EVENT ? `Aucun événement « ${ONLY_EVENT} ».` : 'Aucun événement publié.');
    }

    const out = [];
    for (const event of events) {
        const categories = await prisma.category.findMany({
            where: { eventId: event.id },
            include: { phases: { orderBy: { position: 'asc' }, include: { battles: true } } },
            orderBy: { position: 'asc' },
        });
        for (const category of categories) {
            const matches =
                !ONLY_CATEGORY ||
                [category.slug, category.kind, category.name].some(
                    (v) => String(v).toLowerCase() === ONLY_CATEGORY
                );
            if (matches) out.push({ event, category });
        }
    }
    return out;
}

async function main() {
    const list = await targets();
    let posted = 0;
    let skipped = 0;

    for (const { event, category } of list) {
        const count = await prisma.prediction.count({
            where: { categoryId: category.id, ...(SUBMITTED_ONLY ? { submitted: true } : {}) },
        });

        if (count < MIN_PRONOS) {
            skipped += 1;
            if (DRY) console.log(`— ${event.slug} · ${category.slug} : ${count} pronostic(s), ignoré.\n`);
            continue;
        }

        const stages = await stagesFor(category);
        if (!stages.length) {
            skipped += 1;
            continue;
        }

        const header = `${category.name} — ${event.name} ${event.year}`;
        const footer = `${count} pronostic(s)${SUBMITTED_ONLY ? ' déposé(s)' : ', brouillons compris'}`;

        // Un encart par palier : le lecteur parcourt les paliers séparément au
        // lieu de dérouler un pavé, et Discord les sépare d'un filet.
        const embeds = stages.map((s, i) => ({
            title: i === 0 ? `${header} · ${s.title}` : s.title,
            description: `${s.body}\n${s.note}`,
            ...(i === stages.length - 1 ? { footer: { text: footer } } : {}),
        }));

        if (DRY) {
            console.log(`══ ${header} — ${footer} ══\n`);
            for (const s of stages) {
                console.log(`▸ ${s.title}`);
                console.log(s.body.replace(/```/g, ''));
                console.log(`  ${s.note}\n`);
            }
            posted += 1;
            continue;
        }

        const sent = await postEmbeds('REPORT', embeds);
        if (!sent.ok) {
            console.error(`[consensus] ${event.slug}/${category.slug} :`, sent.error);
            process.exitCode = 1;
            continue;
        }
        console.log(`[consensus] ${header} — ${stages.length} palier(s) postés.`);
        posted += 1;
    }

    console.log(
        `[consensus] ${posted} catégorie(s) ${DRY ? 'préparée(s)' : 'postée(s)'}, ${skipped} ignorée(s).`
    );
}

if (process.argv[1] && process.argv[1].endsWith('consensus.js')) {
    main()
        .catch((err) => {
            console.error(err.message ?? err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}