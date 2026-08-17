import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { buildScoreboard, resolveScope } from '../lib/scoreboard.js';
import {
    COMMENTS_PER_HOUR,
    MAX_COMMENT_LENGTH,
    MAX_GROUPS_OWNED,
    MAX_MEMBERS,
    loadGroup,
    requireGroupOwner,
    serializeGroup,
    uniqueInviteCode,
    uniqueSlug,
} from '../lib/groups.js';

/**
 * Les groupes privés : le classement du site restreint à quelques personnes,
 * et des commentaires sur les pronostics les uns des autres.
 *
 * Aucun groupe n'est listé nulle part. On y entre par un lien d'invitation,
 * jamais par une recherche — c'est la seule porte, et c'est ce qui permet de
 * traiter « je ne suis pas membre » et « ce groupe n'existe pas » comme la
 * même réponse.
 */
export const groupRouter = Router();

/**
 * Relaie les erreurs d'un gestionnaire asynchrone vers le middleware d'erreur.
 * Sans cela, une exception devient un rejet non géré : le processus tombe et le
 * navigateur voit une connexion coupée plutôt qu'un message.
 */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// --- Aperçu d'une invitation ------------------------------------------------------
//
// La seule route lisible sans être connecté. Elle permet à la page d'invitation
// d'annoncer « Rejoindre Les Potes » avant la connexion Discord, plutôt que de
// demander de s'identifier pour une destination inconnue. Elle ne divulgue rien
// à qui ne possède pas déjà le code.

groupRouter.get('/join/:code', guard(async (req, res) => {
    const group = await prisma.group.findUnique({
        where: { inviteCode: req.params.code },
        select: {
            slug: true,
            name: true,
            description: true,
            inviteOpen: true,
            _count: { select: { members: true } },
        },
    });

    if (!group) return res.status(404).json({ error: 'Cette invitation n’est pas valide.' });

    const membership = req.user
        ? await prisma.groupMember.findFirst({
            where: { userId: req.user.id, group: { inviteCode: req.params.code } },
            select: { role: true },
        })
        : null;

    res.json({
        invite: {
            name: group.name,
            description: group.description,
            memberCount: group._count.members,
            open: group.inviteOpen && group._count.members < MAX_MEMBERS,
            full: group._count.members >= MAX_MEMBERS,
            // Le slug n'est rendu qu'à qui est déjà membre : sinon il permettrait de
            // deviner l'adresse du groupe sans y entrer.
            alreadyMember: Boolean(membership),
            slug: membership ? group.slug : null,
        },
    });
}));

// Tout le reste demande un compte.
groupRouter.use(requireAuth);

// --- Mes groupes --------------------------------------------------------------------

groupRouter.get('/mine', guard(async (req, res) => {
    const memberships = await prisma.groupMember.findMany({
        where: { userId: req.user.id },
        orderBy: { joinedAt: 'asc' },
        include: {
            group: {
                select: {
                    slug: true,
                    name: true,
                    description: true,
                    createdAt: true,
                    _count: { select: { members: true } },
                },
            },
        },
    });

    res.json({
        groups: memberships.map((m) => ({
            slug: m.group.slug,
            name: m.group.name,
            description: m.group.description,
            createdAt: m.group.createdAt,
            memberCount: m.group._count.members,
            myRole: m.role,
            joinedAt: m.joinedAt,
        })),
        limits: { ownedMax: MAX_GROUPS_OWNED, membersMax: MAX_MEMBERS },
    });
}));

const groupInput = z.object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(280).optional().nullable(),
});

groupRouter.post('/', guard(async (req, res) => {
    const { name, description } = groupInput.parse(req.body ?? {});

    const owned = await prisma.groupMember.count({
        where: { userId: req.user.id, role: 'OWNER' },
    });
    if (owned >= MAX_GROUPS_OWNED) {
        return res.status(409).json({
            error: `Vous possédez déjà ${MAX_GROUPS_OWNED} groupes. Transmettez-en un ou dissolvez-en un pour en créer un autre.`,
        });
    }

    const [slug, inviteCode] = await Promise.all([uniqueSlug(name), uniqueInviteCode()]);

    // Le groupe et sa première adhésion naissent ensemble : un groupe sans
    // propriétaire ne pourrait plus jamais en recevoir un, l'index partiel
    // n'ayant pas d'existence à réparer.
    const group = await prisma.group.create({
        data: {
            slug,
            name,
            description: description || null,
            inviteCode,
            members: { create: { userId: req.user.id, role: 'OWNER' } },
        },
        include: {
            members: {
                include: {
                    user: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
                },
            },
        },
    });

    res.status(201).json({ group: serializeGroup(group, group.members[0]) });
}));

// --- Un groupe -----------------------------------------------------------------------

groupRouter.get('/:slug', loadGroup, (req, res) => {
    res.json({ group: serializeGroup(req.group, req.membership) });
});

groupRouter.patch('/:slug', loadGroup, requireGroupOwner, guard(async (req, res) => {
    const { name, description } = groupInput.partial().parse(req.body ?? {});

    const group = await prisma.group.update({
        where: { id: req.group.id },
        // Le slug ne suit PAS le nom : les liens déjà partagés dans une
        // conversation Discord ne doivent pas cesser de fonctionner parce que
        // quelqu'un a corrigé une faute de frappe.
        data: {
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description: description || null } : {}),
        },
        include: {
            members: {
                orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
                include: {
                    user: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
                },
            },
        },
    });

    res.json({ group: serializeGroup(group, req.membership) });
}));

groupRouter.delete('/:slug', loadGroup, requireGroupOwner, guard(async (req, res) => {
    // Les adhésions et les commentaires partent en cascade, comme déclaré au
    // schéma. Les pronostics, eux, appartiennent à leurs auteurs : dissoudre un
    // groupe n'efface que la conversation, jamais le jeu.
    await prisma.group.delete({ where: { id: req.group.id } });
    console.log(`[groupes] ${req.group.slug} dissous par ${req.user.username}.`);
    res.json({ ok: true });
}));

// --- Classement interne -----------------------------------------------------------------

groupRouter.get('/:slug/scoreboard', loadGroup, guard(async (req, res) => {
    const scope = await resolveScope({ event: req.query.event, kind: req.query.kind });
    if (scope.notFound) return res.status(404).json({ error: 'Événement introuvable.' });

    const userIds = req.group.members.map((m) => m.userId);

    const board = await buildScoreboard({
        eventId: scope.eventId,
        categoryKind: scope.categoryKind,
        userIds,
        // Un membre qui n'a rien déposé figure quand même, à zéro. Dans un cercle
        // de huit, l'absent est une information ; sur le classement général, faire
        // apparaître des milliers de comptes vides n'en serait pas une.
        pad: true,
        // Les lectures de foule demandent trois avis par contender pour valoir
        // quelque chose. À huit personnes, elles seraient vides ou trompeuses.
        readings: false,
        take: MAX_MEMBERS,
    });

    res.json({
        scope: { event: scope.eventSlug, kind: scope.categoryKind },
        totals: board.totals,
        players: board.players,
    });
}));

/**
 * Les pronostics déposés des membres — la matière à commenter.
 *
 * Les brouillons n'y sont jamais : ce sont des hésitations, elles restent
 * privées jusqu'au dépôt, à l'intérieur d'un groupe comme ailleurs.
 */
groupRouter.get('/:slug/predictions', loadGroup, guard(async (req, res) => {
    const scope = await resolveScope({ event: req.query.event, kind: req.query.kind });
    if (scope.notFound) return res.status(404).json({ error: 'Événement introuvable.' });

    const userIds = req.group.members.map((m) => m.userId);

    const predictions = await prisma.prediction.findMany({
        where: {
            submitted: true,
            userId: { in: userIds },
            ...(scope.eventId ? { eventId: scope.eventId } : {}),
            ...(scope.categoryKind ? { category: { kind: scope.categoryKind } } : {}),
            // Un événement encore en brouillon n'est visible de personne, pas même
            // dans un cercle privé.
            event: { status: { not: 'DRAFT' } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 200,
        select: {
            id: true,
            label: true,
            points: true,
            scoredAt: true,
            updatedAt: true,
            user: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
            event: { select: { slug: true, name: true, year: true, status: true } },
            category: { select: { name: true, kind: true } },
        },
    });

    // Le nombre de commentaires du groupe sur chacun : c'est ce qui signale où la
    // conversation a lieu. Compté en une requête plutôt qu'en une par ligne.
    const counts = await prisma.groupComment.groupBy({
        by: ['predictionId'],
        where: { groupId: req.group.id, predictionId: { in: predictions.map((p) => p.id) } },
        _count: { _all: true },
    });
    const byPrediction = new Map(counts.map((c) => [c.predictionId, c._count._all]));

    res.json({
        predictions: predictions.map((p) => ({ ...p, comments: byPrediction.get(p.id) ?? 0 })),
    });
}));

// --- Invitation ---------------------------------------------------------------------------

/** Renouvelle le code : le seul geste qui referme un lien ayant fuité. */
groupRouter.post('/:slug/invite', loadGroup, requireGroupOwner, guard(async (req, res) => {
    const inviteCode = await uniqueInviteCode();
    await prisma.group.update({ where: { id: req.group.id }, data: { inviteCode } });
    res.json({ inviteCode });
}));

/** Ouvre ou ferme les inscriptions sans changer le code déjà partagé. */
groupRouter.patch('/:slug/invite', loadGroup, requireGroupOwner, guard(async (req, res) => {
    const { open } = z.object({ open: z.boolean() }).parse(req.body ?? {});
    await prisma.group.update({ where: { id: req.group.id }, data: { inviteOpen: open } });
    res.json({ inviteOpen: open });
}));

groupRouter.post('/join/:code', guard(async (req, res) => {
    const group = await prisma.group.findUnique({
        where: { inviteCode: req.params.code },
        include: { members: { select: { userId: true } } },
    });

    if (!group) return res.status(404).json({ error: 'Cette invitation n’est pas valide.' });

    if (group.members.some((m) => m.userId === req.user.id)) {
        // Déjà membre : ce n'est pas une erreur, c'est quelqu'un qui a recliqué sur
        // le lien. On le renvoie chez lui.
        return res.json({ slug: group.slug, joined: false });
    }

    if (!group.inviteOpen) {
        return res.status(403).json({ error: 'Les inscriptions à ce groupe sont fermées.' });
    }
    if (group.members.length >= MAX_MEMBERS) {
        return res.status(409).json({ error: `Ce groupe est complet (${MAX_MEMBERS} membres).` });
    }

    await prisma.groupMember.create({
        data: { groupId: group.id, userId: req.user.id, role: 'MEMBER' },
    });

    res.status(201).json({ slug: group.slug, joined: true });
}));

// --- Membres --------------------------------------------------------------------------------

groupRouter.post('/:slug/leave', loadGroup, guard(async (req, res) => {
    if (req.membership.role === 'OWNER') {
        return res.status(409).json({
            error:
                'Vous possédez ce groupe. Transmettez la propriété à un autre membre, ou dissolvez le groupe.',
        });
    }

    await prisma.groupMember.delete({
        where: { groupId_userId: { groupId: req.group.id, userId: req.user.id } },
    });
    res.json({ ok: true });
}));

groupRouter.delete('/:slug/members/:userId', loadGroup, requireGroupOwner, guard(async (req, res) => {
    if (req.params.userId === req.user.id) {
        return res.status(400).json({ error: 'Utilisez la dissolution ou le transfert de propriété.' });
    }

    const target = req.group.members.find((m) => m.userId === req.params.userId);
    if (!target) return res.status(404).json({ error: 'Cette personne n’est pas membre du groupe.' });

    // Les commentaires de la personne exclue restent : ils appartiennent à la
    // conversation du groupe, pas à son appartenance. Les effacer réécrirait des
    // échanges auxquels d'autres ont répondu.
    await prisma.groupMember.delete({
        where: { groupId_userId: { groupId: req.group.id, userId: target.userId } },
    });
    res.json({ ok: true });
}));

/**
 * Transmettre la propriété.
 *
 * L'ordre des deux écritures n'est pas indifférent : l'index partiel interdit
 * deux propriétaires sur un même groupe, donc l'ancien doit être rétrogradé
 * avant que le nouveau soit promu. Dans une transaction, pour qu'aucun échec
 * intermédiaire ne laisse un groupe sans personne aux commandes.
 */
groupRouter.post('/:slug/transfer', loadGroup, requireGroupOwner, guard(async (req, res) => {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body ?? {});

    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Vous êtes déjà propriétaire de ce groupe.' });
    }
    const target = req.group.members.find((m) => m.userId === userId);
    if (!target) return res.status(404).json({ error: 'Cette personne n’est pas membre du groupe.' });

    await prisma.$transaction([
        prisma.groupMember.update({
            where: { groupId_userId: { groupId: req.group.id, userId: req.user.id } },
            data: { role: 'MEMBER' },
        }),
        prisma.groupMember.update({
            where: { groupId_userId: { groupId: req.group.id, userId } },
            data: { role: 'OWNER' },
        }),
    ]);

    console.log(`[groupes] ${req.group.slug} : propriété transmise par ${req.user.username}.`);
    res.json({ ok: true });
}));

// --- Commentaires ----------------------------------------------------------------------------

const commentInput = z.object({
    body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});

/**
 * Vérifie qu'un pronostic est commentable dans ce groupe.
 *
 * Deux conditions, et les deux comptent. Le pronostic doit être DÉPOSÉ — un
 * brouillon reste privé. Et son auteur doit être MEMBRE du groupe : sans cela,
 * un identifiant collé dans l'URL suffirait à ouvrir un fil sur le pronostic
 * de n'importe qui, dans un cercle où l'intéressé n'entrera jamais lire ce
 * qu'on dit de lui.
 */
async function commentablePrediction(group, predictionId) {
    const prediction = await prisma.prediction.findUnique({
        where: { id: predictionId },
        select: { id: true, userId: true, submitted: true, event: { select: { status: true } } },
    });

    if (!prediction || !prediction.submitted) return null;
    if (prediction.event.status === 'DRAFT') return null;
    if (!group.members.some((m) => m.userId === prediction.userId)) return null;
    return prediction;
}

groupRouter.get('/:slug/predictions/:predictionId/comments', loadGroup, guard(async (req, res) => {
    const prediction = await commentablePrediction(req.group, req.params.predictionId);
    if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable dans ce groupe.' });

    const comments = await prisma.groupComment.findMany({
        where: { groupId: req.group.id, predictionId: prediction.id },
        orderBy: { createdAt: 'asc' },
        include: {
            author: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
        },
    });

    res.json({
        comments: comments.map((c) => ({
            id: c.id,
            body: c.body,
            createdAt: c.createdAt,
            editedAt: c.editedAt,
            author: c.author,
            mine: c.authorId === req.user.id,
            // Le propriétaire fait le ménage dans son groupe ; chacun efface le sien.
            canDelete: c.authorId === req.user.id || req.membership.role === 'OWNER',
        })),
    });
}));

groupRouter.post('/:slug/predictions/:predictionId/comments', loadGroup, guard(async (req, res) => {
    const prediction = await commentablePrediction(req.group, req.params.predictionId);
    if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable dans ce groupe.' });

    const { body } = commentInput.parse(req.body ?? {});

    // Le quota est compté en base plutôt que gardé en mémoire : un compteur en
    // mémoire repart à zéro à chaque redémarrage du conteneur, et le seul moment
    // où l'on redémarre est justement celui où quelque chose déborde.
    const recent = await prisma.groupComment.count({
        where: {
            authorId: req.user.id,
            createdAt: { gte: new Date(Date.now() - 3600_000) },
        },
    });
    if (recent >= COMMENTS_PER_HOUR) {
        return res.status(429).json({ error: 'Trop de commentaires publiés. Réessayez dans un moment.' });
    }

    const comment = await prisma.groupComment.create({
        data: {
            groupId: req.group.id,
            predictionId: prediction.id,
            authorId: req.user.id,
            body,
        },
        include: {
            author: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
        },
    });

    res.status(201).json({
        comment: {
            id: comment.id,
            body: comment.body,
            createdAt: comment.createdAt,
            editedAt: null,
            author: comment.author,
            mine: true,
            canDelete: true,
        },
    });
}));

groupRouter.patch('/:slug/comments/:commentId', loadGroup, guard(async (req, res) => {
    const comment = await prisma.groupComment.findFirst({
        where: { id: req.params.commentId, groupId: req.group.id },
        select: { id: true, authorId: true },
    });
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable.' });

    // Modifier reste le privilège de l'auteur, y compris face au propriétaire :
    // corriger la phrase de quelqu'un d'autre en gardant sa signature est pire
    // que l'effacer.
    if (comment.authorId !== req.user.id) {
        return res.status(403).json({ error: 'Seul son auteur peut modifier un commentaire.' });
    }

    const { body } = commentInput.parse(req.body ?? {});

    const updated = await prisma.groupComment.update({
        where: { id: comment.id },
        // `editedAt` est renseigné à la première modification : un commentaire
        // retouché après coup ne doit pas pouvoir se faire passer pour l'original.
        data: { body, editedAt: new Date() },
    });

    res.json({ comment: { id: updated.id, body: updated.body, editedAt: updated.editedAt } });
}));

groupRouter.delete('/:slug/comments/:commentId', loadGroup, guard(async (req, res) => {
    const comment = await prisma.groupComment.findFirst({
        where: { id: req.params.commentId, groupId: req.group.id },
        select: { id: true, authorId: true },
    });
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable.' });

    if (comment.authorId !== req.user.id && req.membership.role !== 'OWNER') {
        return res.status(403).json({ error: 'Vous ne pouvez pas supprimer ce commentaire.' });
    }

    await prisma.groupComment.delete({ where: { id: comment.id } });
    res.json({ ok: true });
}));