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
 * données brutes. Toute correction de la DÉFINITION d'une moyenne doit être
 * portée dans les deux — c'est écrit ici pour qu'on ne l'oublie pas.
 *
 * ─── Ce que « moyen » veut dire, palier par palier ───────────────────────────
 *
 *   — TOP MOYEN : le rang moyen de chacun sur une phase de classement. TOUS
 *     les participants classés sortent, pas seulement les qualifiés : la carte
 *     montre la ligne de coupe, donc elle a besoin de ce qu'il y a en dessous.
 *     `cut` porte le nombre de qualifiés attendus.
 *
 *   — BRACKET MOYEN : voir `assignRound` plus bas. Le tour est attribué d'un
 *     bloc, pas case par case.
 *
 *   — PODIUM MOYEN : le vainqueur le plus pronostiqué de la finale retenue,
 *     son adversaire, et le vainqueur de la petite finale.
 *
 *   node scripts/instagram.js --event=gbb-2026 > gbb-2026.json
 *   node scripts/instagram.js --latest
 *   node scripts/instagram.js --event=gbb-2026 --drafts   # brouillons compris
 *   node scripts/instagram.js --event=gbb-2026 --cap=40   # lignes d'un top
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const SUBMITTED_ONLY = !flag('drafts');
const ONLY_EVENT = value('event') ?? null;
// La carte répartit son classement sur deux colonnes au-delà d'une quinzaine
// de lignes ; à soixante-quatre, les noms deviennent illisibles sur un
// téléphone. Ce plafond est un garde-fou, pas une mise en forme.
const RANK_CAP = Number(value('cap') ?? 64);
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
// La même liste que `MAIN_LINE` de `server/src/lib/bracket.js` : l'ordre dans
// lequel un tour alimente le suivant. Elle est recopiée plutôt qu'importée
// parce qu'un script autonome ne doit pas dépendre du graphe de modules du
// serveur — mais si un tour s'ajoute là-bas, il s'ajoute ici.
const MAIN_LINE = ROUNDS.map(([r]) => r);
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
 * Toutes les affiches pronostiquées d'une phase, avec leur vainqueur.
 *
 * Une seule requête plutôt que deux : le vainqueur ne se compte plus sur la
 * case entière mais sur l'AFFICHE, donc les deux comptages ne peuvent plus
 * être faits séparément. Le groupement porte sur (tour, case, paire,
 * vainqueur), et l'assemblage se fait ensuite en JavaScript — quelques
 * centaines de lignes par phase, sans commune mesure avec les dizaines de
 * milliers de pronostics qu'on évite de rapatrier.
 *
 * `LEAST`/`GREATEST` normalise le côté : « A contre B » et « B contre A » sont
 * le même pronostic, et les compter séparément couperait en deux un consensus
 * qui existe.
 */
function battleRows(categoryId, phaseId) {
    return prisma.$queryRawUnsafe(
        `
        WITH pronos AS (${PRONOS})
        SELECT pb.round                                       AS round,
               pb.slot                                        AS slot,
               LEAST(pb."contenderAId", pb."contenderBId")    AS un,
               GREATEST(pb."contenderAId", pb."contenderBId") AS deux,
               pb."winnerId"                                  AS gagnant,
               COUNT(*)::int                                  AS n
        FROM "PredictedBattle" pb
        JOIN pronos ON pronos.id = pb."predictionId"
        WHERE pb."phaseId" = $2
          AND pb."contenderAId" IS NOT NULL
          AND pb."contenderBId" IS NOT NULL
        GROUP BY 1, 2, 3, 4, 5
        `,
        categoryId,
        phaseId
    );
}

/** Le nom de chaque contender de la catégorie, par identifiant. */
async function nameMap(categoryId) {
    const rows = await prisma.$queryRawUnsafe(NAMES, categoryId);
    return new Map(rows.map((r) => [r.id, String(r.nom).trim()]));
}

/* ---------------------------------------------------------------------------
   L'attribution d'un tour
   --------------------------------------------------------------------------- */

/**
 * Le tableau le plus pronostiqué d'un tour, en une passe gloutonne.
 *
 * ─── Le défaut que ça corrige ────────────────────────────────────────────────
 *
 * La version précédente prenait, case par case, l'affiche la plus fréquente.
 * Sur un tour dont le tirage est lui-même pronostiqué — en Solo, il découle du
 * classement d'éliminations de chacun — aucune affiche ne dépasse 15 %, et des
 * choix indépendants se contredisaient : PACMax sortait dans deux quarts
 * différents, D-low dans les deux demies. Une image qui montre le même nom
 * deux fois dans un tour passe pour un bug, pas pour une statistique.
 *
 * ─── La règle ────────────────────────────────────────────────────────────────
 *
 * On classe TOUTES les affiches du tour par fréquence, toutes cases
 * confondues, et on les prend dans cet ordre en écartant celles qui
 * réutilisent un nom déjà placé ou une case déjà remplie. Le tour obtenu ne
 * nomme chacun qu'une fois, et sert d'abord les affiches les plus certaines :
 * c'est le tableau le plus pronostiqué qu'on puisse écrire sans se contredire.
 *
 * ─── Pourquoi une recherche et pas un glouton ────────────────────────────────
 *
 * Un glouton se peint dans un coin. Sur les quarts Solo il prend la meilleure
 * affiche de chaque case dans l'ordre des fréquences, arrive à la dernière et
 * découvre que les deux noms qu'il lui reste sont déjà placés — il doit alors
 * réintroduire le doublon qu'on voulait supprimer. Ce n'est pas un cas de
 * laboratoire : c'est exactement ce qui arrive avec les données du 16
 * septembre.
 *
 * On explore donc toutes les combinaisons, en profondeur, avec deux freins
 * qui suffisent à rendre le coût négligeable : les affiches de chaque case
 * sont triées par fréquence et plafonnées aux douze premières — au-delà, on
 * est dans le bruit —, et une branche est abandonnée dès que sa borne
 * supérieure ne peut plus battre la meilleure solution déjà trouvée. Un
 * compteur de nœuds garantit en dernier ressort qu'un tour pathologique ne
 * fera jamais tourner le script indéfiniment.
 *
 * Le résultat est le tour SANS DOUBLON dont les affiches totalisent le plus
 * de pronostics. Il maximise le nombre de pronostics représentés, pas la
 * certitude de chaque case prise isolément : une case peut donc perdre
 * quelques points de `pairPct` pour qu'une autre redevienne possible. C'est
 * le prix d'un tableau qu'on peut lire, et `pairPct` reste dans la sortie
 * pour que ce prix soit visible.
 *
 * Si aucune combinaison complète n'existe — deux cases dont toutes les
 * affiches partagent le même nom —, on retombe sur le glouton, en préférant à
 * chaque pas l'affiche qui réutilise le moins de noms déjà placés. Mieux vaut
 * un tour complet avec un doublon résiduel qu'une case vide, qui elle ne
 * s'explique pas du tout.
 */
const PAIRS_PER_SLOT = 12;
const SEARCH_BUDGET = 200000;

function assignRound(slots, total) {
    const order = [...slots.keys()].sort((a, b) => a - b);
    const lists = order.map((slot) =>
        [...slots.get(slot).entries()]
            .map(([key, p]) => ({ slot, key, ...p }))
            .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
            .slice(0, PAIRS_PER_SLOT)
    );

    // Ce que les cases restantes peuvent rapporter au mieux, pour couper les
    // branches sans avoir à les descendre.
    const rest = new Array(lists.length + 1).fill(0);
    for (let i = lists.length - 1; i >= 0; i -= 1) rest[i] = rest[i + 1] + (lists[i][0]?.n ?? 0);

    let best = null;
    let bestScore = -1;
    let budget = SEARCH_BUDGET;
    const used = new Set();
    const pick = [];

    const walk = (i, score) => {
        if (budget <= 0) return;
        budget -= 1;
        if (i === lists.length) {
            if (score > bestScore) {
                bestScore = score;
                best = pick.slice();
            }
            return;
        }
        if (score + rest[i] <= bestScore) return;

        for (const c of lists[i]) {
            if (used.has(c.un) || used.has(c.deux)) continue;
            used.add(c.un);
            used.add(c.deux);
            pick.push(c);
            walk(i + 1, score + c.n);
            pick.pop();
            used.delete(c.un);
            used.delete(c.deux);
        }
    };
    walk(0, 0);

    const taken = best ?? greedyRound(lists);

    return taken
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((c) => ({ ...c, pairPct: Math.round((100 * c.n) / Math.max(total, 1)) }));
}

/** Le repli : remplir chaque case en réutilisant le moins de noms possible. */
function greedyRound(lists) {
    const used = new Set();
    const out = [];
    for (const list of lists) {
        const cost = (c) => (used.has(c.un) ? 1 : 0) + (used.has(c.deux) ? 1 : 0);
        const chosen = list.slice().sort((a, b) => cost(a) - cost(b) || b.n - a.n)[0];
        if (!chosen) continue;
        used.add(chosen.un);
        used.add(chosen.deux);
        out.push(chosen);
    }
    return out;
}

/* ---------------------------------------------------------------------------
   L'assemblage
   --------------------------------------------------------------------------- */

async function rankingOf(category) {
    for (const phase of category.phases) {
        if (!RANKING_TYPES.includes(phase.type)) continue;
        const rows = await rankingRows(category.id, phase.id);
        if (!rows.length) continue;

        return {
            phase: phase.name,
            phaseEn: phase.nameEn ?? phase.name,
            // La coupe n'ampute plus la liste : elle dit seulement où passe le
            // trait. Tous les participants classés sont là, et la carte peint
            // en jaune ceux qui passent, en gris les autres.
            cut: phase.qualifierCount ?? null,
            rows: rows.slice(0, RANK_CAP).map((r, i) => ({
                place: i + 1,
                name: String(r.nom).trim(),
                avg: Number(r.moyenne.toFixed(2)),
                median: Number(r.mediane.toFixed(1)),
                sd: Number(r.ecart.toFixed(2)),
            })),
        };
    }
    return null;
}

/* ---------------------------------------------------------------------------
   La propagation
   --------------------------------------------------------------------------- */

/**
 * Qui passe, entre deux noms, d'après les confrontations pronostiquées.
 *
 * On regarde d'abord ce qui s'est joué à CE tour : « X contre Y en demie » et
 * « X contre Y en quart » ne se pronostiquent pas pareil, et un public qui
 * envoie X en finale peut très bien lui préférer Y plus tôt. Faute de
 * rencontre à ce tour, on élargit à toute la phase. Si les deux ne se sont
 * jamais croisés dans aucun pronostic — ce qui arrive sur un tirage libre —,
 * on tranche par le nombre de victoires que chacun accumule à ce tour.
 *
 * `winnerPct` est la part des pronostics QUI ONT POSÉ CETTE AFFICHE, pas du
 * total : sur une affiche que quinze personnes ont vue venir, rapporter au
 * total donnerait 8 % à un vainqueur désigné à l'unanimité.
 */
function decide(book, round, A, B) {
    const key = [A, B].sort().join('|');

    for (const scope of [`${round}|${key}`, key]) {
        const tally = book.h2h.get(scope);
        if (!tally || !tally.size) continue;
        const a = tally.get(A) ?? 0;
        const b = tally.get(B) ?? 0;
        if (a + b === 0) continue;
        const winner = a === b ? [A, B].sort()[0] : a > b ? A : B;
        return { winner, winnerPct: Math.round((100 * Math.max(a, b)) / (a + b)) };
    }

    const wa = book.wins.get(`${round}|${A}`) ?? 0;
    const wb = book.wins.get(`${round}|${B}`) ?? 0;
    return { winner: wa === wb ? [A, B].sort()[0] : wa > wb ? A : B, winnerPct: null };
}

/** Combien de pronostics ont posé cette affiche, à ce tour puis en général. */
function metCount(book, round, A, B) {
    const key = [A, B].sort().join('|');
    return book.met.get(`${round}|${key}`) ?? book.met.get(key) ?? 0;
}

/** Une affiche prête à sortir, à partir de deux identifiants. */
function makeBattle(book, round, slot, A, B, total) {
    const d = decide(book, round, A, B);
    return {
        slot,
        unId: A,
        deuxId: B,
        winnerId: d.winner,
        winnerPct: d.winnerPct,
        pairPct: Math.round((100 * metCount(book, round, A, B)) / Math.max(total, 1)),
    };
}

/** Le tour de départ, celui qu'aucun autre n'alimente : issu de `assignRound`. */
function seedRound(slots, total) {
    return assignRound(slots, total).map((c) => {
        const [id, n] = [...c.winners.entries()].sort((x, y) => y[1] - x[1])[0] ?? [];
        return {
            slot: c.slot,
            unId: c.un,
            deuxId: c.deux,
            winnerId: id ?? null,
            winnerPct: id ? Math.round((100 * n) / Math.max(c.n, 1)) : null,
            pairPct: c.pairPct,
        };
    });
}

/**
 * Le tableau, à partir des affiches comptées. Séparée de `bracketOf` parce
 * qu'elle ne touche pas la base : c'est la partie qui se vérifie hors ligne,
 * et c'est aussi la seule qui puisse produire un arbre faux.
 */
export function buildBracket(rows, names, total) {
    // (tour → case → paire → { n, vainqueurs }), pour le tour de départ.
    const tree = new Map();
    // Les confrontations, indexées à part : une fois par tour et une fois
    // toutes phases confondues. C'est ce qui permet de trancher une affiche
    // que la propagation vient d'inventer et qui ne tombe dans aucune case.
    const book = { h2h: new Map(), met: new Map(), wins: new Map() };

    const bump = (map, k, v) => map.set(k, (map.get(k) ?? 0) + v);
    const bumpIn = (map, k, id, v) => {
        if (!map.has(k)) map.set(k, new Map());
        const inner = map.get(k);
        inner.set(id, (inner.get(id) ?? 0) + v);
    };

    for (const r of rows) {
        if (!tree.has(r.round)) tree.set(r.round, new Map());
        const slots = tree.get(r.round);
        if (!slots.has(r.slot)) slots.set(r.slot, new Map());
        const pairs = slots.get(r.slot);

        const key = `${r.un}|${r.deux}`;
        if (!pairs.has(key)) pairs.set(key, { un: r.un, deux: r.deux, n: 0, winners: new Map() });
        const pair = pairs.get(key);
        pair.n += r.n;

        bump(book.met, `${r.round}|${key}`, r.n);
        bump(book.met, key, r.n);

        if (r.gagnant) {
            pair.winners.set(r.gagnant, (pair.winners.get(r.gagnant) ?? 0) + r.n);
            bumpIn(book.h2h, `${r.round}|${key}`, r.gagnant, r.n);
            bumpIn(book.h2h, key, r.gagnant, r.n);
            bump(book.wins, `${r.round}|${r.gagnant}`, r.n);
        }
    }

    /**
     * Le tableau, construit de l'avant.
     *
     * ─── Le défaut que ça corrige ────────────────────────────────────────
     *
     * Chaque tour était choisi indépendamment : on prenait les affiches les
     * plus pronostiquées des quarts, puis celles des demies, sans vérifier
     * que les secondes découlaient des premières. Sur un tirage figé les
     * deux coïncident, et Loopstation sortait juste. Sur un tirage que
     * chacun pronostique, les numéros de case ne désignent pas la même
     * chose d'un joueur à l'autre, et les demies les plus fréquentes se
     * retrouvaient peuplées de gens que les quarts affichés venaient
     * d'éliminer : la demie 1 du Solo opposait FootboxG à River' alors que
     * les traits du tableau la font alimenter par King Inertia.
     *
     * Un lecteur ne voit pas deux statistiques indépendantes, il voit un
     * arbre — et un arbre dont les traits contredisent les noms est faux,
     * quelle que soit la rigueur de chaque case prise à part.
     *
     * ─── La règle ────────────────────────────────────────────────────────
     *
     * Seul le PREMIER tour est élu sur les fréquences. Ensuite, la case j
     * du tour suivant oppose les vainqueurs des cases 2j et 2j+1, sans
     * exception, et on ne se demande plus QUI s'y trouve mais seulement
     * lequel des deux passe. L'arbre est alors juste par construction, et
     * la petite finale — les deux perdants de demie — aussi.
     *
     * Le prix : une affiche affichée peut n'avoir été pronostiquée que par
     * une poignée de gens. `pairPct` le dit, et c'est la bonne façon de le
     * dire — bien mieux qu'un tableau flatteur mais impossible.
     */
    const present = MAIN_LINE.filter((r) => tree.has(r));
    const built = [];

    for (let i = 0; i < present.length; i += 1) {
        const round = present[i];
        const prev = built[i - 1]?.battles ?? null;
        const expected = prev ? prev.length / 2 : 0;

        let battles = null;
        if (prev && Number.isInteger(expected) && expected >= 1 && prev.every((b) => b.winnerId)) {
            battles = [];
            for (let j = 0; j < expected; j += 1) {
                battles.push(
                    makeBattle(book, round, j, prev[2 * j].winnerId, prev[2 * j + 1].winnerId, total)
                );
            }
        }

        built.push({ round, battles: battles ?? seedRound(tree.get(round), total) });
    }

    // La petite finale se déduit des demies, pas des fréquences : ses deux
    // places sont prises par ceux qui viennent de perdre.
    if (tree.has('SMALL_FINAL')) {
        const semi = built.find((b) => b.round === 'SEMI');
        let battles = null;
        if (semi && semi.battles.length === 2 && semi.battles.every((b) => b.winnerId)) {
            const losers = semi.battles.map((b) => (b.winnerId === b.unId ? b.deuxId : b.unId));
            battles = [makeBattle(book, 'SMALL_FINAL', 0, losers[0], losers[1], total)];
        }
        built.push({ round: 'SMALL_FINAL', battles: battles ?? seedRound(tree.get('SMALL_FINAL'), total) });
    }

    // Les tours hors ligne principale — LEGACY — n'alimentent rien et ne
    // sont alimentés par rien : ils restent élus sur les fréquences.
    for (const round of tree.keys()) {
        if (MAIN_LINE.includes(round) || round === 'SMALL_FINAL') continue;
        built.push({ round, battles: seedRound(tree.get(round), total) });
    }

    const rounds = built.map(({ round, battles }) => ({
        round,
        label: ROUND_LABEL.get(round) ?? round,
        battles: battles.map((b) => ({
            slot: b.slot,
            a: names.get(b.unId) ?? '—',
            b: names.get(b.deuxId) ?? '—',
            pairPct: b.pairPct,
            winner: b.winnerId ? names.get(b.winnerId) ?? null : null,
            winnerPct: b.winnerPct,
        })),
    }));

    return rounds;
}

async function bracketOf(category, total) {
    for (const phase of category.phases) {
        if (!BRACKET_TYPES.includes(phase.type)) continue;

        const [rows, names] = await Promise.all([
            battleRows(category.id, phase.id),
            nameMap(category.id),
        ]);
        if (!rows.length) continue;

        return {
            phase: phase.name,
            phaseEn: phase.nameEn ?? phase.name,
            rounds: buildBracket(rows, names, total),
        };
    }
    return null;
}

/**
 * Le podium moyen.
 *
 * Tout se lit dans la finale retenue : son vainqueur, et l'autre camp de la
 * même affiche. Le finaliste malheureux n'a plus besoin d'un comptage à part,
 * et ne peut donc plus contredire le vainqueur — les deux viennent de la même
 * ligne.
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

        const bracket = await bracketOf(category, count);
        out.push({
            slug: category.slug,
            name: category.name,
            nameEn: category.nameEn ?? category.name,
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

if (process.argv[1] && process.argv[1].endsWith('instagram.js')) {
    main()
        .catch((err) => {
            console.error(err.message ?? err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}