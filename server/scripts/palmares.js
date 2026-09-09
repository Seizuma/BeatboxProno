import { prisma } from '../src/lib/prisma.js';

/**
 * Voir et nettoyer ce que les clôtures ont distribué.
 *
 * ─── Pourquoi un script et pas seulement un écran ───────────────────────────
 *
 * Le panneau « Badges et points distribués » ne montre qu'UN événement à la
 * fois, et il ne voit que ce qui est encore rattaché à un événement. Or deux
 * situations lui échappent complètement :
 *
 *   1. Les crédits ORPHELINS. `WalletEntry.eventId` est en `onDelete: SetNull` :
 *      supprimer une compète laisse ses crédits en place avec un `eventId` vide.
 *      C'est délibéré — reprendre un argent peut-être déjà dépensé mettrait des
 *      soldes à découvert — mais ces lignes ne sont alors atteignables par
 *      AUCUN écran, puisque tous filtrent par événement. Un porte-monnaie garni
 *      sans aucune compète pour l'expliquer vient presque toujours de là.
 *
 *   2. La vue d'ensemble. « Qui a des badges, et pourquoi ? » est une question
 *      qui traverse les événements ; y répondre en ouvrant six panneaux l'un
 *      après l'autre ne marche pas.
 *
 * ─── Rien ne s'écrit sans le dire ───────────────────────────────────────────
 *
 * Par défaut le script LIT. `--purge` décrit ce qu'il retirerait ; il faut y
 * ajouter `--confirm` pour qu'une seule ligne soit supprimée. Deux mots plutôt
 * qu'un : celui-ci efface le palmarès de gens qui n'ont rien demandé.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *
 *   node scripts/palmares.js
 *       L'état de tout : par compète, badges et crédits distribués.
 *
 *   node scripts/palmares.js --user seizuma
 *       Le détail d'une personne : chaque badge, chaque ligne de porte-monnaie
 *       avec sa provenance. C'est la commande qui répond à « d'où viennent ces
 *       102 points ? ».
 *
 *   node scripts/palmares.js --event fbc-loop-2026 --purge --confirm
 *       Retire badges et crédits de clôture de cette compète.
 *
 *   node scripts/palmares.js --event fbc-loop-2026 --purge --disable --confirm
 *       Les retire ET coupe la distribution pour de bon. À préférer dans la
 *       quasi-totalité des cas : voir plus bas.
 *
 *   node scripts/palmares.js --orphans --purge --confirm
 *       Retire les crédits dont la compète a disparu.
 *
 *   node scripts/palmares.js --all --purge --confirm
 *       Remet TOUS les palmarès à zéro. Les achats et les crédits manuels
 *       restent : seuls les badges et les crédits de clôture partent.
 */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : null;
};

const purge = flag('purge');
const confirm = flag('confirm');
const userQuery = value('user');
const eventSlug = value('event');

const money = (n) => `${n > 0 ? '+' : ''}${n}`;

/* ------------------------------------------------------------------------ */
/* Le détail d'une personne                                                  */
/* ------------------------------------------------------------------------ */

if (userQuery) {
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { username: { equals: userQuery, mode: 'insensitive' } },
                { globalName: { equals: userQuery, mode: 'insensitive' } },
                { discordId: userQuery },
                { id: userQuery },
            ],
        },
        select: { id: true, username: true, globalName: true },
    });
    if (!user) {
        console.error(`Aucun compte sous « ${userQuery} ».`);
        process.exit(1);
    }

    const [badges, entries, filed] = await Promise.all([
        prisma.badgeAward.findMany({
            where: { userId: user.id },
            include: { event: { select: { slug: true, name: true, year: true } } },
            orderBy: { awardedAt: 'desc' },
        }),
        prisma.walletEntry.findMany({
            where: { userId: user.id },
            include: { event: { select: { slug: true, name: true, year: true } } },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.prediction.groupBy({
            by: ['eventId'],
            where: { userId: user.id, submitted: true },
            _count: { _all: true },
        }),
    ]);

    const played = new Set(filed.map((f) => f.eventId));

    console.log(`\n${user.globalName ?? user.username}\n${'='.repeat(64)}`);

    console.log('\nBADGES');
    if (badges.length === 0) console.log('  aucun');
    for (const b of badges) {
        // L'anomalie qu'on cherche : un badge sur une compète où la personne
        // n'a rien déposé. Le code n'en produit pas — la distribution part de
        // la liste des déposants — mais tant qu'on ne l'a pas vérifié soi-même,
        // on soupçonne le code.
        const suspect = !played.has(b.eventId) ? '   ← AUCUN PRONO SUR CETTE COMPÈTE' : '';
        console.log(`  ${b.code.padEnd(12)} ${b.event.name} ${b.event.year}${suspect}`);
    }

    console.log('\nPORTE-MONNAIE');
    let solde = 0;
    for (const e of entries) {
        solde += e.amount;
        const from =
            e.kind === 'EVENT_POINTS'
                ? e.event
                    ? `${e.event.name} ${e.event.year}`
                    : 'COMPÈTE SUPPRIMÉE — invisible de tout écran'
                : e.kind === 'PURCHASE'
                    ? `achat : ${e.itemId}`
                    : `crédit manuel${e.note ? ` : ${e.note}` : ''}`;
        console.log(`  ${money(e.amount).padStart(7)}  ${e.kind.padEnd(13)} ${from}`);
    }
    console.log(`  ${'—'.repeat(50)}`);
    console.log(`  ${String(solde).padStart(7)}  SOLDE`);

    const orphelins = entries.filter((e) => e.kind === 'EVENT_POINTS' && !e.eventId);
    if (orphelins.length > 0) {
        console.log(
            `\n→ ${orphelins.length} crédit(s) viennent d'une compète supprimée. Aucun écran ne peut\n` +
            '  les atteindre : node scripts/palmares.js --orphans --purge --confirm'
        );
    }
    console.log();
    await prisma.$disconnect();
    process.exit(0);
}

/* ------------------------------------------------------------------------ */
/* Le nettoyage                                                              */
/* ------------------------------------------------------------------------ */

if (purge) {
    let where = null;
    let libelle = '';

    if (flag('orphans')) {
        where = { orphans: true };
        libelle = 'les crédits dont la compète a disparu';
    } else if (flag('all')) {
        where = { all: true };
        libelle = 'TOUS les badges et TOUS les crédits de clôture du site';
    } else if (eventSlug) {
        const event = await prisma.event.findUnique({
            where: { slug: eventSlug },
            select: { id: true, name: true, year: true },
        });
        if (!event) {
            console.error(`Aucun événement au slug « ${eventSlug} ».`);
            process.exit(1);
        }
        where = { eventId: event.id };
        libelle = `le palmarès de ${event.name} ${event.year}`;
    } else {
        console.error('Précisez --event <slug>, --orphans ou --all.');
        process.exit(1);
    }

    const badgeWhere = where.all ? {} : where.orphans ? null : { eventId: where.eventId };
    const creditWhere = where.all
        ? { kind: 'EVENT_POINTS' }
        : where.orphans
            ? { kind: 'EVENT_POINTS', eventId: null }
            : { kind: 'EVENT_POINTS', eventId: where.eventId };

    const [badges, credits] = await Promise.all([
        badgeWhere ? prisma.badgeAward.count({ where: badgeWhere }) : 0,
        prisma.walletEntry.aggregate({
            where: creditWhere,
            _sum: { amount: true },
            _count: { _all: true },
        }),
    ]);

    console.log(`\nÀ retirer : ${libelle}`);
    console.log(`  badges ...... ${badges}`);
    console.log(`  crédits ..... ${credits._count._all} lignes, ${credits._sum.amount ?? 0} point(s)`);

    if (!confirm) {
        console.log('\nRien n\'a été supprimé. Ajoutez --confirm pour exécuter.\n');
        await prisma.$disconnect();
        process.exit(0);
    }

    /**
     * Couper la distribution en même temps que l'on nettoie.
     *
     * ─── Pourquoi les deux gestes doivent être UN seul ──────────────────────
     *
     * Purger sans couper ne tient pas : une compète décerne un jeu de badges
     * par défaut, et le moindre aller-retour de statut — corriger une date,
     * republier une phase, repasser par « en cours » puis « terminé » pour
     * remettre le porte-monnaie d'équerre — redistribue tout. On nettoie, on
     * touche à autre chose, et les badges sont revenus sans qu'on comprenne
     * pourquoi.
     *
     * C'est exactement ce qui s'est produit le 10 septembre : la case existait
     * déjà et n'avait simplement jamais été décochée.
     *
     * `--disable` est donc à préférer dans la quasi-totalité des cas. Il n'est
     * pas le défaut parce qu'un nettoyage peut aussi précéder une
     * redistribution VOULUE — après un changement de barème, par exemple — et
     * couper d'office obligerait alors à recocher sans le savoir.
     */
    const ops = [];
    if (badgeWhere) ops.push(prisma.badgeAward.deleteMany({ where: badgeWhere }));
    ops.push(prisma.walletEntry.deleteMany({ where: creditWhere }));
    if (flag('disable')) {
        ops.push(
            prisma.event.updateMany({
                where: where.eventId ? { id: where.eventId } : {},
                // `badgeSet: null` coupe les médailles, `awardsCredits: false`
                // coupe le crédit. On coupe les deux : `--disable` sert à
                // neutraliser une compète, pas à la démonétiser à moitié.
                data: { badgeSet: null, awardsCredits: false },
            })
        );
    }
    const done = await prisma.$transaction(ops);

    console.log(`\nSupprimé : ${done.map((d) => d.count).join(' + ')} ligne(s).`);
    if (flag('disable')) {
        console.log(
            'Distribution coupée : ni badge ni crédit, quel que soit le statut de la compète.\n' +
            'Pour la rouvrir, choisissez un jeu de badges et recochez le crédit dans ses réglages.\n'
        );
    } else {
        console.log(
            'ATTENTION : les réglages de la compète sont inchangés.\n' +
            'Tant qu\'un jeu de badges y est choisi, le moindre aller-retour de statut\n' +
            'redistribuera tout. Relancez avec --disable, ou mettez « Aucun badge » dans\n' +
            'les réglages de l\'événement.\n'
        );
    }
    await prisma.$disconnect();
    process.exit(0);
}

/* ------------------------------------------------------------------------ */
/* L'état de tout                                                            */
/* ------------------------------------------------------------------------ */

const events = await prisma.event.findMany({
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
    // Les deux réglages sont la première chose à regarder quand un palmarès
    // revient après un nettoyage : tant qu'un jeu de badges est choisi, toute
    // bascule vers « terminé » le redistribue.
    select: {
        id: true, slug: true, name: true, year: true, status: true,
        badgeSet: true, awardsCredits: true,
    },
});

console.log(`\nPALMARÈS DISTRIBUÉS\n${'='.repeat(72)}`);

for (const e of events) {
    const [badges, credits, players] = await Promise.all([
        prisma.badgeAward.count({ where: { eventId: e.id } }),
        prisma.walletEntry.aggregate({
            where: { eventId: e.id, kind: 'EVENT_POINTS' },
            _sum: { amount: true },
            _count: { _all: true },
        }),
        prisma.prediction.groupBy({
            by: ['userId'],
            where: { eventId: e.id, submitted: true },
            _count: { _all: true },
        }),
    ]);

    if (badges === 0 && credits._count._all === 0) continue;

    console.log(
        `\n${e.name} ${e.year}  [${e.status}]  (${e.slug})\n` +
        `  ${badges} badge(s) · ${credits._count._all} crédit(s) pour ${credits._sum.amount ?? 0} point(s)\n` +
        `  ${players.length} personne(s) ont déposé un pronostic ici\n` +
        `  badges : ${e.badgeSet ? `« ${e.badgeSet} » — toute bascule vers « terminé » redistribue` : 'aucun'}\n` +
        `  crédite le porte-monnaie : ${e.awardsCredits ? 'oui' : 'non'}`
    );
    if (e.status !== 'FINISHED') {
        console.log('  → la compète a distribué puis a QUITTÉ « terminé ». Rien n\'est repris tout seul.');
    }
}

// Les orphelins : la catégorie que les écrans ne voient pas.
const orphans = await prisma.walletEntry.aggregate({
    where: { kind: 'EVENT_POINTS', eventId: null },
    _sum: { amount: true },
    _count: { _all: true },
});

console.log(`\n${'='.repeat(72)}`);
if (orphans._count._all > 0) {
    console.log(
        `CRÉDITS ORPHELINS : ${orphans._count._all} ligne(s), ${orphans._sum.amount ?? 0} point(s).\n` +
        'Leur compète a été supprimée ; `eventId` est passé à NULL et aucun écran ne les\n' +
        'atteint. C\'est l\'explication la plus fréquente d\'un porte-monnaie garni sans\n' +
        'aucune compète pour le justifier.\n\n' +
        '  node scripts/palmares.js --orphans --purge --confirm'
    );
} else {
    console.log('Aucun crédit orphelin.');
}
console.log();

await prisma.$disconnect();