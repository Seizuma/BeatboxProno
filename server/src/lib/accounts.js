import { prisma } from './prisma.js';

/**
 * La fermeture d'un compte.
 *
 * ─── Pourquoi ce fichier ────────────────────────────────────────────────────
 *
 * La suppression existait déjà, mais enfermée dans `routes/account.js` : elle
 * ne servait qu'à quelqu'un qui ferme SON compte. L'administration peut
 * désormais en supprimer un aussi, et elle doit emporter exactement les mêmes
 * choses.
 *
 * Recopier la procédure aurait créé une seconde vérité. Elle aurait pris du
 * retard au premier modèle ajouté, et la divergence se serait vue là où on ne
 * la cherche pas : un groupe laissé sans propriétaire après une suppression
 * administrative, sans que rien dans l'application permette de réparer ça.
 */

/**
 * Transmet les groupes possédés avant que le compte disparaisse.
 *
 * La cascade du schéma efface l'adhésion en même temps que la personne, ce qui
 * laisserait un groupe sans propriétaire : plus personne pour inviter, exclure
 * ou dissoudre. Le titre passe donc au plus ancien membre restant. Le groupe
 * n'est dissous que s'il ne reste personne — supprimer le cercle de cinq amis
 * parce que son créateur s'en va détruirait leur classement sans qu'ils aient
 * rien demandé.
 *
 * L'ordre compte : l'index partiel interdit deux propriétaires, donc l'ancien
 * est rétrogradé avant que le nouveau soit promu.
 */
export async function handOverGroups(tx, userId) {
    const owned = await tx.groupMember.findMany({
        where: { userId, role: 'OWNER' },
        select: { groupId: true },
    });

    for (const { groupId } of owned) {
        const heir = await tx.groupMember.findFirst({
            where: { groupId, userId: { not: userId } },
            orderBy: { joinedAt: 'asc' },
            select: { userId: true },
        });

        if (!heir) {
            await tx.group.delete({ where: { id: groupId } });
            continue;
        }

        await tx.groupMember.update({
            where: { groupId_userId: { groupId, userId } },
            data: { role: 'MEMBER' },
        });
        await tx.groupMember.update({
            where: { groupId_userId: { groupId, userId: heir.userId } },
            data: { role: 'OWNER' },
        });
    }
}

/**
 * Supprime un compte, groupes transmis.
 *
 * La suppression et la transmission forment un tout : un échec à mi-chemin
 * laisserait soit un compte fantôme, soit un cercle sans personne aux commandes.
 *
 * Le reste part en cascade, comme déclaré au schéma : pronostics, classements
 * pronostiqués, affiches, podiums, messages de la boîte à idées, journées de
 * visite, adhésions, commentaires, tampons, avis et vues de profil. Les écrire
 * à la main ici créerait la seconde vérité qu'on cherche justement à éviter.
 */
export async function deleteAccount(userId) {
    await prisma.$transaction(async (tx) => {
        await handOverGroups(tx, userId);
        await tx.user.delete({ where: { id: userId } });
    });
}

/**
 * Le compte est-il fermé à la connexion ?
 *
 * Une seule colonne, `bannedAt`, plutôt qu'un booléen doublé d'une date : deux
 * champs qui disent la même chose finissent par se contredire, et c'est
 * toujours celui qu'on ne lit pas qui a raison.
 */
export const isBanned = (user) => Boolean(user?.bannedAt);