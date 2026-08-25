import { prisma } from './prisma.js';

/**
 * Les notifications.
 *
 * Un principe qui gouverne tout le fichier : **une notification ne doit jamais
 * faire échouer l'action qui l'a produite**. Un commentaire publié dont l'avis
 * n'est pas parti reste un commentaire publié ; un événement passé en
 * pronostics ouverts reste ouvert même si la diffusion tombe. L'inverse serait
 * absurde. Chaque écriture est donc isolée dans un `try`, et l'échec finit dans
 * les journaux.
 *
 * Deuxième principe : on ne se notifie jamais soi-même. Commenter son propre
 * pronostic, rejoindre son propre groupe — la pastille rouge doit signifier
 * « quelque chose s'est produit », pas « vous avez cliqué ».
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
async function push({ userIds, kind, actorId = null, groupId = null, predictionId = null, eventId = null }) {
  const targets = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (targets.length === 0) return 0;

  try {
    const { count } = await prisma.notification.createMany({
      data: targets.map((userId) => ({ userId, kind, actorId, groupId, predictionId, eventId })),
    });
    return count;
  } catch (err) {
    // Volontairement avalé : voir l'en-tête du fichier.
    console.error('[notifications]', err?.message ?? err);
    return 0;
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
 * discussion à trois ne préviendrait que le propriétaire du pronostic.
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
    // Le propriétaire du pronostic est retiré ici : il vient de recevoir l'avis
    // plus précis, et deux pastilles pour un seul commentaire donnent
    // l'impression d'un système qui bégaie.
    userIds: participants.map((p) => p.authorId).filter((id) => id !== predictionOwnerId),
    kind: 'COMMENT_REPLY',
    actorId: authorId,
    groupId,
    predictionId,
  });
}

/**
 * Les pronostics d'une compétition viennent d'ouvrir : tout le monde est
 * prévenu.
 *
 * ─── Le seul avis que le SITE envoie ─────────────────────────────────────────
 *
 * Il n'a pas d'auteur : `actorId` reste vide, et la phrase ne cite aucun nom.
 * Ce n'est pas l'administrateur qui parle, c'est la compétition qui s'ouvre.
 *
 * ─── Une ligne par personne, et c'est voulu ──────────────────────────────────
 *
 * Quelques milliers de lignes en une seule insertion : c'est instantané, et
 * surtout ça réutilise tout ce qui existe déjà — le décompte des non-lus, le
 * marquage individuel, la purge à la suppression d'un compte. Un « avis global »
 * rattaché à personne aurait demandé un second mécanisme de lecture, en
 * parallèle de celui du journal des nouveautés.
 *
 * ─── Pourquoi la garde d'unicité est une requête et non un drapeau ───────────
 *
 * On repasse par OPEN plus souvent qu'on ne croit : une erreur de manipulation,
 * un statut corrigé, un événement remis en pronostics après un report. Sans
 * garde, chacun de ces gestes renotifierait la totalité des comptes.
 *
 * La garde interroge l'existence d'un avis `EVENT_OPEN` pour cet événement,
 * plutôt qu'un drapeau posé sur l'événement lui-même. La différence compte : un
 * drapeau peut mentir — il serait levé même si l'insertion des avis avait
 * échoué juste après. Ici, l'existence d'un avis EST la preuve de l'envoi.
 *
 * @returns {Promise<{sent: number, skipped: boolean}>}
 */
export async function notifyEventOpen(eventId) {
  try {
    const already = await prisma.notification.findFirst({
      where: { kind: 'EVENT_OPEN', eventId },
      select: { id: true },
    });
    if (already) return { sent: 0, skipped: true };

    // Tout le monde, sans distinction d'activité. Le jour où le site comptera
    // des milliers de comptes dormants, une borne sur `lastSeenAt` se posera
    // ici — mais tant que la communauté tient dans une salle, écarter
    // quelqu'un parce qu'il n'est pas venu depuis six mois reviendrait à le
    // priver de la seule chose qui l'aurait fait revenir.
    const users = await prisma.user.findMany({ select: { id: true } });

    const sent = await push({
      userIds: users.map((u) => u.id),
      kind: 'EVENT_OPEN',
      eventId,
    });

    console.log(`[notifications] ouverture annoncée à ${sent} compte(s).`);
    return { sent, skipped: false };
  } catch (err) {
    console.error('[notifications]', err?.message ?? err);
    return { sent: 0, skipped: false };
  }
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
        // Le slug sert au lien de retour, le nom à composer la phrase.
        event: { select: { slug: true, name: true, year: true } },
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
      event: n.event,
      predictionId: n.predictionId,
    })),
  };
}