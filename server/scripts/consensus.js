import { PrismaClient } from '@prisma/client';
import { postToDiscord } from '../src/lib/discord.js';

/**
 * Le « top N moyen » d'une catégorie, posté dans le salon des rapports.
 *
 * ─── Ce que la moyenne veut dire ─────────────────────────────────────────────
 *
 * Deux structures, deux lectures, et le script choisit celle qui a du sens pour
 * la catégorie qu'on lui donne :
 *
 *   — TABLEAU. Un Solo GBB en Top 32 n'a aucun classement pronostiqué : il n'y
 *     a rien à moyenner au sens propre. Le consensus se lit alors dans les
 *     affiches — un tour gagné est un tour de plus, et la moyenne des tours
 *     gagnés classe du plus attendu au moins attendu.
 *
 *   — CLASSEMENT. Dès qu'une phase de wildcards ou d'éliminations existe, le
 *     rang moyen est la lecture littérale, et la meilleure.
 *
 * Dans les deux cas l'écart compte autant que la moyenne : deux favoris à trois
 * centièmes l'un de l'autre ne sont pas le même favori si l'un est sacré par un
 * tiers des pronostiqueurs et l'autre par trois pour cent. D'où les colonnes de
 * répartition à côté du chiffre.
 *
 * ─── Pourquoi l'agrégation est en SQL ────────────────────────────────────────
 *
 * Même raison que le rapport de fréquentation : ramener quarante mille lignes
 * de pronostics pour les compter en JavaScript coûterait de plus en plus cher à
 * chaque compétition, pour un résultat identique.
 *
 *   node scripts/consensus.js --dry-run
 *   node scripts/consensus.js                          # dernier événement, Solo
 *   node scripts/consensus.js --category=loopstation
 *   node scripts/consensus.js --event=grand-beatbox-battle-2026 --top=16
 *   node scripts/consensus.js --drafts                 # inclure les brouillons
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const TOP = Number(value('top') ?? 8);
const CATEGORY = value('category') ?? 'solo';
// Un brouillon n'est pas un pronostic : par défaut on ne compte que ce qui a
// été déposé. `--drafts` sert à jauger l'engouement avant la fermeture.
const SUBMITTED_ONLY = !flag('drafts');

/* ---------------------------------------------------------------------------
   Choisir de quoi on parle
   --------------------------------------------------------------------------- */

async function resolveCategory() {
    const slug = value('event');

    const event = slug
        ? await prisma.event.findUnique({ where: { slug } })
        // Sans précision : la compète la plus récente qui ne soit pas un
        // brouillon. C'est celle dont on veut voir le consensus.
        : await prisma.event.findFirst({
            where: { status: { not: 'DRAFT' } },
            orderBy: [{ year: 'desc' }, { startsAt: 'desc' }],
        });

    if (!event) throw new Error(slug ? `Aucun événement « ${slug} ».` : 'Aucun événement publié.');

    const wanted = CATEGORY.toLowerCase();
    const categories = await prisma.category.findMany({
        where: { eventId: event.id },
        include: { phases: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
    });

    const category =
        categories.find((c) => c.slug.toLowerCase() === wanted) ??
        categories.find((c) => c.kind.toLowerCase() === wanted) ??
        categories.find((c) => c.name.toLowerCase() === wanted);

    if (!category) {
        throw new Error(
            `Aucune catégorie « ${CATEGORY} » sur ${event.name} ${event.year}. ` +
            `Disponibles : ${categories.map((c) => c.slug).join(', ') || 'aucune'}.`
        );
    }

    return { event, category };
}

/* ---------------------------------------------------------------------------
   Les deux agrégations
   --------------------------------------------------------------------------- */

/**
 * Le nom affiché d'un contender : le sien, sinon celui du ou des artistes
 * rattachés. C'est la règle de `naming.js`, réécrite en SQL parce que la
 * jointure se fait ici.
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

/** Le consensus lu dans les affiches : moyenne des tours gagnés. */
async function fromBracket(categoryId) {
    return prisma.$queryRawUnsafe(
        `
        WITH pronos AS (
            SELECT p.id FROM "Prediction" p
            WHERE p."categoryId" = $1 ${SUBMITTED_ONLY ? 'AND p.submitted = true' : ''}
        ),
        total AS (SELECT GREATEST(COUNT(*), 1)::numeric AS n FROM pronos),
        noms AS (${NAMES}),
        victoires AS (
            SELECT pb."winnerId" AS cid,
                   COUNT(*)::int                                        AS gagnees,
                   COUNT(*) FILTER (WHERE pb.round = 'FINAL')::int      AS titres,
                   COUNT(*) FILTER (WHERE pb.round = 'SEMI')::int       AS finales,
                   COUNT(*) FILTER (WHERE pb.round = 'QUARTER')::int    AS demies
            FROM "PredictedBattle" pb
            JOIN pronos ON pronos.id = pb."predictionId"
            WHERE pb."winnerId" IS NOT NULL
            GROUP BY pb."winnerId"
        )
        SELECT n.nom,
               (COALESCE(v.gagnees, 0) / t.n)::float8         AS valeur,
               (100 * COALESCE(v.titres, 0)  / t.n)::float8   AS pct_titre,
               (100 * COALESCE(v.finales, 0) / t.n)::float8   AS pct_finale,
               (100 * COALESCE(v.demies, 0)  / t.n)::float8   AS pct_demies
        FROM noms n
        CROSS JOIN total t
        LEFT JOIN victoires v ON v.cid = n.id
        ORDER BY valeur DESC, pct_titre DESC, n.nom
        `,
        categoryId
    );
}

/** Le consensus lu dans un classement pronostiqué : rang moyen. */
async function fromRanks(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH noms AS (${NAMES})
        SELECT n.nom,
               AVG(pr.rank)::float8                                       AS valeur,
               COALESCE(STDDEV_SAMP(pr.rank), 0)::float8                  AS ecart,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pr.rank)::float8 AS mediane,
               COUNT(*)::int                                              AS pronos
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

/* ---------------------------------------------------------------------------
   La mise en forme
   --------------------------------------------------------------------------- */

const BAR = 10;

/** Une jauge en blocs pleins, largeur fixe : les lignes restent alignées. */
function bar(part) {
    const filled = Math.max(0, Math.min(BAR, Math.round(part * BAR)));
    return '█'.repeat(filled) + '·'.repeat(BAR - filled);
}

const pct = (n) => `${Math.round(n)}%`.padStart(4);

export function renderBracket(rows, top) {
    const best = Math.max(...rows.map((r) => r.valeur), 1);
    // Jamais plus étroit que l'intitulé de colonne, sinon l'en-tête déborde et
    // toutes les colonnes suivantes glissent d'un cran.
    const width = Math.min(18, Math.max(11, ...rows.slice(0, top).map((r) => r.nom.length)));

    const head = `    ${'PARTICIPANT'.padEnd(width)}  TOURS  RÉPARTITION   TITRE FIN. 1/2`;
    const lines = rows.slice(0, top).map((r, i) => {
        const nom = r.nom.length > width ? `${r.nom.slice(0, width - 1)}…` : r.nom.padEnd(width);
        return (
            `${String(i + 1).padStart(2)}. ${nom}  ` +
            `${r.valeur.toFixed(2).padStart(5)}  ${bar(r.valeur / best)}  ` +
            `${pct(r.pct_titre)} ${pct(r.pct_finale)} ${pct(r.pct_demies)}`
        );
    });

    return ['```', head, '─'.repeat(head.length), ...lines, '```'].join('\n');
}

export function renderRanks(rows, top) {
    // Jamais plus étroit que l'intitulé de colonne, sinon l'en-tête déborde et
    // toutes les colonnes suivantes glissent d'un cran.
    const width = Math.min(18, Math.max(11, ...rows.slice(0, top).map((r) => r.nom.length)));

    const head = `    ${'PARTICIPANT'.padEnd(width)}   RANG  MÉDIANE  ÉCART`;
    const lines = rows.slice(0, top).map((r, i) => {
        const nom = r.nom.length > width ? `${r.nom.slice(0, width - 1)}…` : r.nom.padEnd(width);
        return (
            `${String(i + 1).padStart(2)}. ${nom}  ` +
            `${r.valeur.toFixed(2).padStart(5)}  ${r.mediane.toFixed(1).padStart(7)}  ` +
            `${r.ecart.toFixed(2).padStart(5)}`
        );
    });

    return ['```', head, '─'.repeat(head.length), ...lines, '```'].join('\n');
}

/**
 * Le commentaire.
 *
 * Ce que le tableau ne dit pas : si le premier fait l'unanimité ou s'il ne doit
 * sa place qu'à l'absence de concurrent, et si le consensus s'effondre après
 * quelques noms. Sur un tableau, l'écart entre le favori et le suivant se lit
 * en tours ; sur un classement, c'est l'écart-type qui parle.
 */
export function prose(rows, top, method) {
    const head = rows.slice(0, top);
    if (head.length < 2) return 'Trop peu de données pour dégager un consensus.';
    const lines = [];

    if (method === 'bracket') {
        const [first, second] = head;
        lines.push(
            `**${first.nom}** mène avec ${first.valeur.toFixed(2)} tour(s) gagné(s) en moyenne, ` +
            `devant ${second.nom} (${second.valeur.toFixed(2)}).`
        );

        // Le favori du classement n'est pas toujours le champion annoncé : c'est
        // exactement ce qu'une moyenne aplatit, et ça mérite d'être dit.
        const champion = [...rows].sort((a, b) => b.pct_titre - a.pct_titre)[0];
        if (champion && champion.nom !== first.nom) {
            lines.push(
                `Le titre, lui, va le plus souvent à **${champion.nom}** ` +
                `(${Math.round(champion.pct_titre)} % des pronostics).`
            );
        } else if (champion) {
            lines.push(`Sacré par ${Math.round(champion.pct_titre)} % des pronostiqueurs.`);
        }
    } else {
        const [first] = head;
        lines.push(
            `**${first.nom}** en tête avec un rang moyen de ${first.valeur.toFixed(2)} ` +
            `(écart-type ${first.ecart.toFixed(2)}).`
        );
        // Un écart-type élevé sur un rang moyen bas veut dire que le milieu
        // n'est le choix de personne — deux camps qui se moyennent.
        const flou = head.filter((r) => r.ecart > 4);
        if (flou.length) {
            lines.push(
                `${flou.length} nom(s) du top ${top} font l'objet d'un désaccord marqué : ` +
                `${flou.slice(0, 3).map((r) => r.nom).join(', ')}.`
            );
        }
    }

    return lines.join('\n');
}

/* ---------------------------------------------------------------------------
   L'assemblage
   --------------------------------------------------------------------------- */

export async function buildConsensus() {
    const { event, category } = await resolveCategory();

    const ranking = category.phases.find((p) =>
        ['WILDCARD', 'ELIMINATION', 'SEEDING'].includes(p.type)
    );

    const count = await prisma.prediction.count({
        where: { categoryId: category.id, ...(SUBMITTED_ONLY ? { submitted: true } : {}) },
    });

    let rows = [];
    let method = 'bracket';

    if (ranking) {
        rows = await fromRanks(category.id, ranking.id);
        method = 'ranks';
    }
    // Une phase de classement qui existe mais que personne n'a remplie ne dit
    // rien : on retombe alors sur le tableau plutôt que de rendre une page vide.
    if (!rows.length) {
        rows = await fromBracket(category.id);
        method = 'bracket';
    }

    const useful = rows.filter((r) => (method === 'bracket' ? r.valeur > 0 : true));

    const title = `Top ${TOP} moyen — ${category.name} · ${event.name} ${event.year}`;
    const description = useful.length
        ? [
            prose(useful, TOP, method),
            method === 'bracket' ? renderBracket(useful, TOP) : renderRanks(useful, TOP),
        ].join('\n')
        : 'Aucun pronostic exploitable sur cette catégorie.';

    return {
        title,
        description,
        method,
        count,
        rows: useful,
        fields: [
            {
                name: 'Pronostics comptés',
                value: `**${count}**${SUBMITTED_ONLY ? '' : ' (brouillons inclus)'}`,
                inline: true,
            },
            {
                name: 'Lecture',
                value: method === 'bracket' ? 'Tours gagnés dans le tableau' : 'Rang moyen pronostiqué',
                inline: true,
            },
            { name: 'Participants', value: `**${rows.length}**`, inline: true },
        ],
        footer: `${event.slug} · ${category.slug} · consensus sur ${count} pronostic(s)`,
    };
}

async function main() {
    const built = await buildConsensus();

    if (flag('dry-run')) {
        console.log(`— ${built.title} —\n`);
        console.log(built.description.replace(/```/g, '').replace(/\*\*/g, ''));
        console.log(`\n${built.footer}`);
        return;
    }

    const sent = await postToDiscord('REPORT', {
        title: built.title,
        description: built.description,
        fields: built.fields,
        footer: built.footer,
    });

    if (!sent.ok) {
        console.error('[consensus] envoi échoué :', sent.error);
        process.exitCode = 1;
        return;
    }
    console.log(`[consensus] ${built.title} posté.`);
}

// Exécution directe seulement : le module reste importable pour ses fonctions de
// mise en forme, qui n'ont besoin d'aucune base.
if (process.argv[1] && process.argv[1].endsWith('consensus.js')) {
    main()
        .catch((err) => {
            console.error(err.message ?? err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}