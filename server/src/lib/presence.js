import { prisma } from './prisma.js';

/**
 * La journée est une notion locale. Compter les visites sur des journées UTC
 * ferait basculer le compteur à 2 h du matin l'été, en plein pic d'activité un
 * soir de compète — les chiffres seraient justes et illisibles.
 */
export const TZ = process.env.REPORT_TZ ?? 'Europe/Paris';

/** La journée d'un instant, au format AAAA-MM-JJ. */
export function localDay(date = new Date(), tz = TZ) {
    // 'fr-CA' produit nativement AAAA-MM-JJ, ce qui évite de recomposer la date
    // morceau par morceau.
    return new Intl.DateTimeFormat('fr-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/** Les `count` derniers jours, du plus ancien au plus récent, aujourd'hui inclus. */
export function lastDays(count, from = new Date(), tz = TZ) {
    const out = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        out.push(localDay(new Date(from.getTime() - i * 86_400_000), tz));
    }
    return out;
}

/**
 * Ne réécrire une visite qu'une fois par personne et par jour.
 *
 * Sans ce cache, chaque requête authentifiée déclencherait un aller-retour en
 * base pour réaffirmer un fait déjà connu — soit des centaines d'écritures
 * inutiles pour une seule personne qui navigue. L'unicité en base garantit de
 * toute façon le résultat ; le cache n'évite que le trajet.
 */
const seenToday = new Set();
let cacheDay = null;

/**
 * Note qu'une personne s'est manifestée aujourd'hui.
 *
 * Ne lève jamais : la fréquentation est une statistique, elle ne doit pas faire
 * échouer une requête qui, elle, rend un service.
 */
export async function touch(userId) {
    if (!userId) return;

    const day = localDay();
    if (day !== cacheDay) {
        seenToday.clear();
        cacheDay = day;
    }

    const mark = `${userId}:${day}`;
    if (seenToday.has(mark)) return;
    seenToday.add(mark);

    try {
        await prisma.visit.upsert({
            where: { userId_day: { userId, day } },
            create: { userId, day },
            update: {}, // la première visite de la journée fait foi
        });
    } catch (err) {
        // Un utilisateur supprimé entre-temps, une base momentanément indisponible :
        // on perd un point de courbe, pas une requête.
        seenToday.delete(mark);
        console.error('[presence]', err.message);
    }
}