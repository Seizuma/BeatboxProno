import { prisma } from './prisma.js';
import { ITEMS, PROMO_MIN, PROMO_MAX, PROMO_SLOTS, itemById } from './cosmetics.js';

/**
 * La tendance de la boutique et ses promotions.
 *
 * ─── Pourquoi un instantané et pas un calcul à la volée ─────────────────────
 *
 * Compter les achats à chaque ouverture de la boutique serait facile, et ce
 * serait une mauvaise idée : le classement bougerait sous les yeux des gens.
 * Quelqu'un qui hésite entre deux cadres reviendrait le lendemain et ne
 * retrouverait plus l'ordre qu'il avait en tête.
 *
 * Un instantané rafraîchi tous les deux jours donne à la vitrine ce dont elle a
 * besoin : une hiérarchie stable assez longtemps pour qu'on s'y repère, assez
 * courte pour qu'elle reste vraie.
 *
 * ─── Pourquoi la promotion vise les MOINS achetés ───────────────────────────
 *
 * Remiser ce qui se vend déjà ne fait que réduire la recette. Ce qui ne part
 * pas ne part pas pour deux raisons possibles : le prix, ou le fait que
 * personne ne l'ait jamais regardé. Une remise agit sur les deux, parce qu'un
 * bandeau « -40 % » est aussi une mise en avant.
 *
 * Les objets gratuits en sont exclus : on ne fait pas de remise sur zéro.
 */

const DAY = 86_400_000;
const TREND_EVERY = 2 * DAY;
const PROMO_EVERY = 7 * DAY;

/* ---------------------------------------------------------------------------
   La lecture
   --------------------------------------------------------------------------- */

/**
 * L'ordre de la vitrine et les remises en cours.
 *
 * Ne lève jamais et ne bloque rien : sans instantané — première mise en
 * production, table vide, migration en retard — la boutique s'affiche dans son
 * ordre de catalogue, sans promotion. Une vitrine sans tendance reste une
 * vitrine ; une vitrine en erreur n'est rien.
 */
export async function shopState() {
    try {
        const now = new Date();
        const [trend, promos] = await Promise.all([
            prisma.shopTrend.findMany({ orderBy: { position: 'asc' } }),
            prisma.shopPromo.findMany({ where: { endsAt: { gt: now } } }),
        ]);

        return {
            // L'ordre des identifiants, du plus acheté au moins acheté. Le client
            // s'en sert pour trier ; il ne reçoit pas les compteurs, qui ne
            // regardent que l'organisateur.
            trend: trend.map((t) => t.itemId),
            promos: Object.fromEntries(promos.map((p) => [p.itemId, p.percent])),
            promoEndsAt: promos.length
                ? new Date(Math.min(...promos.map((p) => p.endsAt.getTime())))
                : null,
        };
    } catch (err) {
        console.warn('[boutique] tendance indisponible :', err?.message ?? err);
        return { trend: [], promos: {}, promoEndsAt: null };
    }
}

/* ---------------------------------------------------------------------------
   Le calcul
   --------------------------------------------------------------------------- */

/** Le nombre d'achats par objet, tous joueurs confondus. */
async function purchaseCounts() {
    const rows = await prisma.walletEntry.groupBy({
        by: ['itemId'],
        where: { kind: 'PURCHASE', itemId: { not: null } },
        _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.itemId, r._count._all]));
}

/**
 * Recalcule le classement de popularité.
 *
 * Les objets JAMAIS achetés y figurent aussi, à zéro : sans eux, un objet neuf
 * n'apparaîtrait nulle part dans l'ordre et le client ne saurait pas où le
 * mettre. Les départages se font sur le prix décroissant, faute de mieux — un
 * ordre arbitraire mais STABLE vaut mieux qu'un ordre qui change à chaque
 * calcul pour des objets à égalité.
 */
export async function refreshTrend() {
    const counts = await purchaseCounts();

    const ranked = ITEMS.map((item) => ({
        itemId: item.id,
        purchases: counts.get(item.id) ?? 0,
        price: item.price,
    }))
        .sort((a, b) => b.purchases - a.purchases || b.price - a.price || a.itemId.localeCompare(b.itemId))
        .map((row, i) => ({ itemId: row.itemId, purchases: row.purchases, position: i + 1 }));

    await prisma.$transaction([
        prisma.shopTrend.deleteMany({}),
        prisma.shopTrend.createMany({ data: ranked }),
    ]);

    return ranked;
}

/**
 * Tire les promotions de la semaine.
 *
 * Le tirage porte sur les objets les moins achetés, mais il n'est pas
 * déterministe : prendre systématiquement les dix derniers remettrait les mêmes
 * objets en promotion chaque semaine, et une remise permanente n'est plus une
 * remise, c'est un prix. On tire donc dans un vivier deux fois plus large.
 *
 * Le taux aussi est tiré, entre quinze et cinquante. Un objet à -50 % une
 * semaine et -20 % la suivante donne une raison de repasser ; un taux fixe n'en
 * donne aucune.
 */
export async function refreshPromos(now = new Date()) {
    const counts = await purchaseCounts();

    const eligible = ITEMS.filter((i) => i.price > 0)
        .map((i) => ({ id: i.id, purchases: counts.get(i.id) ?? 0 }))
        .sort((a, b) => a.purchases - b.purchases || a.id.localeCompare(b.id));

    const pool = eligible.slice(0, Math.min(eligible.length, PROMO_SLOTS * 2));
    const picked = [];
    const bag = [...pool];
    while (picked.length < Math.min(PROMO_SLOTS, bag.length + picked.length) && bag.length) {
        picked.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    }

    const endsAt = new Date(now.getTime() + PROMO_EVERY);
    const data = picked.map((p) => ({
        itemId: p.id,
        percent: PROMO_MIN + Math.floor(Math.random() * (PROMO_MAX - PROMO_MIN + 1)),
        startsAt: now,
        endsAt,
    }));

    await prisma.$transaction([
        prisma.shopPromo.deleteMany({}),
        prisma.shopPromo.createMany({ data }),
    ]);

    return data;
}

/* ---------------------------------------------------------------------------
   L'horloge
   --------------------------------------------------------------------------- */

/**
 * Rafraîchit ce qui est périmé, et rien d'autre.
 *
 * Deux rythmes différents dans une seule tâche quotidienne, plutôt que deux
 * tâches planifiées séparément. La raison est prosaïque : une planification
 * « tous les deux jours » en cron dérive dès que le processus redémarre un jour
 * impair. Ici, c'est la DATE du dernier calcul qui décide — le redémarrage n'a
 * aucun effet, et rattraper deux jours d'arrêt est automatique.
 */
export async function refreshIfDue({ now = new Date(), force = false } = {}) {
    const done = { trend: false, promos: false };

    const latest = await prisma.shopTrend.findFirst({
        orderBy: { computedAt: 'desc' },
        select: { computedAt: true },
    });
    if (force || !latest || now - latest.computedAt >= TREND_EVERY) {
        await refreshTrend();
        done.trend = true;
    }

    const promo = await prisma.shopPromo.findFirst({
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
    });
    if (force || !promo || promo.endsAt <= now) {
        await refreshPromos(now);
        done.promos = true;
    }

    return done;
}

/* ---------------------------------------------------------------------------
   Le rapport
   --------------------------------------------------------------------------- */

/**
 * Les achats d'une journée locale, objet par objet.
 *
 * Rend un tableau vide quand personne n'a rien acheté — le rapport s'en sert
 * pour omettre entièrement la rubrique plutôt que d'afficher « 0 achat », ce
 * qui n'apprend rien et occupe une place tous les jours.
 */
export async function purchasesOn(day, tz) {
    const rows = await prisma.$queryRawUnsafe(
        `SELECT "itemId", count(*)::int AS n, sum(-amount)::int AS spent
         FROM "WalletEntry"
         WHERE kind = 'PURCHASE'
           AND "itemId" IS NOT NULL
           AND to_char("createdAt" AT TIME ZONE $1, 'YYYY-MM-DD') = $2
         GROUP BY 1
         ORDER BY n DESC, "itemId"`,
        tz,
        day
    );

    return rows
        .map((r) => ({
            itemId: r.itemId,
            item: itemById(r.itemId),
            count: Number(r.n),
            spent: Number(r.spent),
        }))
        // Un objet retiré du catalogue depuis l'achat n'a plus de nom : on le
        // garde quand même, sous son identifiant, plutôt que de fausser le total.
        .filter((r) => r.count > 0);
}