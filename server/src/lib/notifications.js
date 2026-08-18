import { prisma } from './prisma.js';

/**
 * Les notifications.
 *
 * Un principe qui gouverne tout le fichier : **une notification ne doit jamais
 * faire échouer l'action qui l'a produite**. Un commentaire publié dont l'avis
 * n'est pas parti reste un commentaire publié ; l'inverse — perdre le
 * commentaire parce que l'avis a échoué — serait absurde. Chaque écriture est
 * donc isolée dans un `try`, et l'échec finit dans les journaux.
 *
 * Deuxième principe : on ne se notifie jamais soi-même. Commenter son propre
 * pronostic, rejoindre son propre groupe — la pastille rouge doit signifier
 * « quelqu'un s'est manifesté », pas « vous avez cliqué ».
 */

/** Combien d'avis la cloche charge d'un coup. Au-delà, on ne lit plus. */
export const NOTIFICATION_PAGE = 30;

/**
 * Dépose des avis, en écartant le déclencheur et les doublons.
 *
 * `userIds` est dédoublonné : sur un fil, l'auteur du pronostic peut aussi
 * être intervenu dans la conversation, et il recevrait deux fois le même avis
 * pour le même commentaire.
 */
async function push({ userIds, kind, actorId, groupId = null, predictionId = null }) {
    const targets = [...new Set(userIds)].filter((id) => id && id !== actorId);
    if (targets.length === 0) return;

    try {
        await prisma.notification.createMany({
            data: targets.map((userId) => ({ userId, kind, actorId, groupId, predictionId })),
        });
    } catch (err) {
        // Volontairement avalé : voir l'en-tête du fichier.
        console.error('[notifications]', err?.message ?? err);
    }
}

/** Quelqu'un est entré dans un groupe : seul le propriétaire est prévenu. */
export async function notifyGroupJoin({ group, actorId }) {
    const owner = group.members.find((m) => m.role === 'OWNER');
    if (!owner) return;

    await push({
        userIds: [owner.userId],
        kind: 'GROUP_JOIN',
        actorId,
        groupId: group.id,
    });
}

/**
 * Un commentaire vient d'être écrit.
 *
 * Deux cercles de destinataires, et deux natures d'avis. L'auteur du pronostic
 * reçoit « on a commenté chez vous » ; les personnes déjà intervenues dans ce
 * fil reçoivent « la conversation continue ». Sans ce second cercle, une
 * discussion à trois ne préviendrait que le propriétaire du pronostic, et les
 * deux autres ne sauraient jamais qu'on leur a répondu.
 *
 * Le fil est celui du couple (groupe, pronostic) : commenter dans un cercle ne
 * prévient personne d'un autre cercle.
 */
export async function notifyComment({ groupId, predictionId, authorId, predictionOwnerId }) {
    const participants = await prisma.groupComment.findMany({
        where: { groupId, predictionId },
        select: { authorId: true },
        distinct: ['authorId'],
    });

    await push({
        userIds: [predictionOwnerId],
        kind: 'COMMENT_ON_MINE',
        actorId: authorId,
        groupId,
        predictionId,
    });

    await push({
        // Le propriétaire du pronostic est retiré ici : il vient de recevoir
        // l'avis plus précis, et deux pastilles pour un seul commentaire donnent
        // l'impression d'un système qui bégaie.
        userIds: participants.map((p) => p.authorId).filter((id) => id !== predictionOwnerId),
        kind: 'COMMENT_REPLY',
        actorId: authorId,
        groupId,
        predictionId,
    });
}

/**
 * Les avis d'une personne, et le nombre de non-lus.
 *
 * Le décompte est une requête à part plutôt qu'un filtre sur la liste : les
 * non-lus peuvent dépasser la page affichée, et une pastille qui plafonne à
 * trente serait fausse dès qu'on s'absente une semaine.
 */
export async function listNotifications(userId) {
    const [items, unread] = await Promise.all([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: NOTIFICATION_PAGE,
            include: {
                actor: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
                group: { select: { slug: true, name: true } },
            },
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
        unread,
        notifications: items.map((n) => ({
            id: n.id,
            kind: n.kind,
            createdAt: n.createdAt,
            read: Boolean(n.readAt),
            actor: n.actor,
            group: n.group,
            predictionId: n.predictionId,
        })),
    };
}