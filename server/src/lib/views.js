import { prisma } from './prisma.js';
import { localDay } from './presence.js';

/**
 * Les consultations d'un profil de joueur ou d'une fiche d'artiste.
 *
 * ─── Une ligne par visiteur et par jour, pas par clic ───────────────────────
 *
 * Compter les clics donnerait un nombre que n'importe qui peut fabriquer en
 * maintenant F5 : le premier à s'en apercevoir aurait le profil le plus vu du
 * site, et le chiffre ne voudrait plus rien dire. Une ligne par visiteur et par
 * journée résiste à ça sans rien interdire, et elle reste bornée — au pire, un
 * profil regardé tous les jours par tout le monde.
 *
 * C'est la même granularité que `Visit` pour la fréquentation, et pour la même
 * raison : la journée est l'unité qui a du sens dans cette communauté, où l'on
 * revient voir un profil le lendemain d'une compète.
 *
 * ─── Pourquoi seulement les visiteurs connectés ─────────────────────────────
 *
 * Un compteur qui inclut les passages anonymes compte surtout des robots
 * d'indexation. Exiger une session rend le chiffre lisible : « combien de
 * membres sont venus voir » plutôt que « combien de requêtes ont eu lieu ».
 */

/**
 * Le cache d'écriture, même principe que `presence.touch` : l'unicité en base
 * garantit de toute façon le résultat, ce cache n'évite que le trajet quand
 * quelqu'un recharge trois fois la même fiche dans la minute.
 */
const seenToday = new Set();
let cacheDay = null;

/**
 * Note une consultation.
 *
 * Ne lève JAMAIS. Un compteur de vues est un ornement : il n'a pas à faire
 * échouer la requête qui, elle, rend un service. Une erreur ici se solde par un
 * chiffre en retard d'une visite, ce que personne ne remarquera.
 */
export async function recordView({ viewerId, userId = null, artistId = null }) {
    if (!viewerId) return;
    if (!userId && !artistId) return;

    // On ne se regarde pas soi-même. Sans ce garde, le compteur mesurerait
    // surtout la fréquence à laquelle chacun consulte sa propre page — et
    // quiconque veut monter son score n'aurait qu'à revenir chaque jour.
    if (userId && userId === viewerId) return;

    const day = localDay();
    if (day !== cacheDay) {
        seenToday.clear();
        cacheDay = day;
    }

    const mark = `${viewerId}:${userId ?? artistId}:${day}`;
    if (seenToday.has(mark)) return;
    seenToday.add(mark);

    try {
        // `createMany` avec `skipDuplicates` plutôt qu'un `upsert` : il n'y a
        // rien à mettre à jour quand la ligne existe déjà, et l'upsert aurait
        // demandé de nommer une contrainte composite dont l'une des colonnes est
        // nulle — ce que Prisma ne sait pas exprimer.
        await prisma.profileView.createMany({
            data: [{ viewerId, userId, artistId, day }],
            skipDuplicates: true,
        });
    } catch (err) {
        // On retire la marque : la prochaine visite retentera plutôt que de
        // considérer à tort que la ligne est posée.
        seenToday.delete(mark);
        console.warn('[vues] écriture impossible :', err?.message ?? err);
    }
}

/** Le nombre de consultations d'un joueur ou d'un artiste. */
export function countViews({ userId = null, artistId = null }) {
    if (!userId && !artistId) return Promise.resolve(0);
    return prisma.profileView.count({
        where: userId ? { userId } : { artistId },
    });
}