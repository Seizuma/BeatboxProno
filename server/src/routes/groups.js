import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { itemById } from '../lib/cosmetics.js';
import { buildScoreboard } from '../lib/scoreboard.js';
import { notifyComment, notifyGroupJoin } from '../lib/notifications.js';
import {
    COMMENTS_PER_HOUR,
    MAX_COMMENT_LENGTH,
    MAX_EVENTS,
    MAX_GROUPS_PER_USER,
    MAX_MEMBERS,
    accentOf,
    loadGroup,
    requireGroupOwner,
    serializeGroup,
    uniqueInviteCode,
    uniqueSlug,
} from '../lib/groups.js';

/**
 * Les groupes privés : le classement du site restreint à quelques personnes et
 * à quelques compétitions, et des commentaires accrochés aux pronostics.
 *
 * Aucun groupe n'est listé nulle part. On y entre par un lien d'invitation,
 * jamais par une recherche — c'est la seule porte, et c'est ce qui permet de
 * traiter « je ne suis pas membre » et « ce groupe n'existe pas » comme la
 * même réponse.
 */
export const groupRouter = Router();

const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * Le périmètre effectif d'une requête : les événements du groupe, éventuellement
 * réduits à un seul par le filtre de la page.
 *
 * Renvoie `null` si le filtre demande un événement que le groupe ne suit pas.
 * On ne l'ignore pas silencieusement : afficher le classement complet en
 * réponse à une demande précise ferait croire à un résultat filtré.
 */
function scopeEvents(group, groupEventIds, eventSlug) {
    if (!eventSlug) return groupEventIds;
    const match = group.events.find((e) => e.event.slug === String(eventSlug));
    return match ? [match.eventId] : null;
}

const KINDS = ['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'LEGACY'];
const readKind = (value) => (KINDS.includes(String(value)) ? String(value) : null);

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
            events: { select: { event: { select: { name: true, year: true } } }, orderBy: { addedAt: 'asc' } },
        },
    });

    if (!group) return res.status(404).json({ error: 'Cette invitation n’est pas valide.' });

    const membership = req.user
        ? await prisma.groupMember.findFirst({
            where: { userId: req.user.id, group: { inviteCode: req.params.code } },
            select: { role: true },
        })
        : null;

    // Le quota s'annonce AVANT la connexion : mieux vaut le lire sur la page
    // d'invitation que se voir refuser l'entrée après un aller-retour Discord.
    const mine = req.user
        ? await prisma.groupMember.count({ where: { userId: req.user.id } })
        : 0;

    res.json({
        invite: {
            name: group.name,
            description: group.description,
            accent: accentOf(group.slug),
            memberCount: group._count.members,
            events: group.events.map((e) => `${e.event.name} ${e.event.year}`),
            open: group.inviteOpen && group._count.members < MAX_MEMBERS,
            full: group._count.members >= MAX_MEMBERS,
            atLimit: Boolean(req.user) && !membership && mine >= MAX_GROUPS_PER_USER,
            maxGroups: MAX_GROUPS_PER_USER,
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
                    _count: { select: { members: true, events: true } },
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
            accent: accentOf(m.group.slug),
            memberCount: m.group._count.members,
            eventCount: m.group._count.events,
            myRole: m.role,
            joinedAt: m.joinedAt,
        })),
        limits: { groups: MAX_GROUPS_PER_USER, members: MAX_MEMBERS, events: MAX_EVENTS },
    });
}));

const groupInput = z.object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(280).optional().nullable(),
});

groupRouter.post('/', guard(async (req, res) => {
    const { name, description } = groupInput.parse(req.body ?? {});

    // Adhésions comprises : posséder cinq groupes ou en avoir rejoint cinq coûte
    // la même chose, la limite ne distingue donc pas.
    const mine = await prisma.groupMember.count({ where: { userId: req.user.id } });
    if (mine >= MAX_GROUPS_PER_USER) {
        return res.status(409).json({
            error: `Vous êtes déjà dans ${MAX_GROUPS_PER_USER} groupes. Quittez-en un pour en créer un autre.`,
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
                    // Le cadre et l’effet de pseudo voyagent avec le nom, partout où un
                    // membre apparaît : un cosmétique visible du seul propriétaire ne se
                    // vend pas. Ni la bande de profil, ni le skin de carte, ni le tampon —
                    // ils ne s’affichent pas ici, et ce qu’on ne montre pas, on ne le
                    // transporte pas.
                    user: {
                        select: {
                            id: true,
                            username: true,
                            globalName: true,
                            avatarUrl: true,
                            equippedFrame: true,
                            equippedNameFx: true,
                        },
                    },
                },
            },
            events: { include: { event: { select: { id: true, slug: true, name: true, year: true, status: true } } } },
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
        // quelqu'un a corrigé une faute de frappe. La couleur d'accent en découle,
        // elle ne bouge donc pas non plus.
        data: {
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description: description || null } : {}),
        },
        include: {
            members: {
                orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            globalName: true,
                            avatarUrl: true,
                            equippedFrame: true,
                            equippedNameFx: true,
                        },
                    },
                },
            },
            events: {
                orderBy: { addedAt: 'asc' },
                include: { event: { select: { id: true, slug: true, name: true, year: true, status: true } } },
            },
        },
    });

    res.json({ group: serializeGroup(group, req.membership) });
}));

groupRouter.delete('/:slug', loadGroup, requireGroupOwner, guard(async (req, res) => {
    // Le périmètre, les adhésions, les commentaires et les avis partent en
    // cascade, comme déclaré au schéma. Les pronostics, eux, appartiennent à
    // leurs auteurs : dissoudre un groupe n'efface que la conversation.
    await prisma.group.delete({ where: { id: req.group.id } });
    console.log(`[groupes] ${req.group.slug} dissous par ${req.user.username}.`);
    res.json({ ok: true });
}));

// --- Périmètre : les compétitions suivies ------------------------------------------------

/**
 * Remplace la liste des événements suivis.
 *
 * Un remplacement complet plutôt qu'un ajout et un retrait séparés : la liste
 * est courte, l'écran la manipule comme un tout, et deux routes ouvriraient la
 * porte aux états intermédiaires — un groupe momentanément sans périmètre
 * pendant qu'on en change.
 *
 * Retirer un événement ne supprime aucun commentaire. Ils redeviennent
 * simplement invisibles, et réapparaissent si l'événement est remis.
 */
groupRouter.put('/:slug/events', loadGroup, requireGroupOwner, guard(async (req, res) => {
    const { slugs } = z
        .object({ slugs: z.array(z.string()).max(MAX_EVENTS) })
        .parse(req.body ?? {});

    const events = await prisma.event.findMany({
        where: { slug: { in: slugs }, status: { not: 'DRAFT' } },
        select: { id: true },
    });

    if (events.length !== new Set(slugs).size) {
        return res.status(400).json({ error: 'Un des événements demandés est introuvable.' });
    }

    await prisma.$transaction([
        prisma.groupEvent.deleteMany({ where: { groupId: req.group.id } }),
        prisma.groupEvent.createMany({
            data: events.map((e) => ({ groupId: req.group.id, eventId: e.id })),
        }),
    ]);

    const group = await prisma.group.findUnique({
        where: { id: req.group.id },
        include: {
            members: {
                orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            globalName: true,
                            avatarUrl: true,
                            equippedFrame: true,
                            equippedNameFx: true,
                        },
                    },
                },
            },
            events: {
                orderBy: { addedAt: 'asc' },
                include: { event: { select: { id: true, slug: true, name: true, year: true, status: true } } },
            },
        },
    });

    res.json({ group: serializeGroup(group, req.membership) });
}));

// --- Classement interne -----------------------------------------------------------------

groupRouter.get('/:slug/scoreboard', loadGroup, guard(async (req, res) => {
    const eventIds = scopeEvents(req.group, req.groupEventIds, req.query.event);
    if (eventIds === null) {
        return res.status(404).json({ error: 'Cet événement n’est pas suivi par le groupe.' });
    }

    const board = await buildScoreboard({
        eventIds,
        categoryKind: readKind(req.query.kind),
        userIds: req.group.members.map((m) => m.userId),
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
        scope: { event: req.query.event ?? null, kind: readKind(req.query.kind) },
        configured: req.groupEventIds.length > 0,
        totals: board.totals,
        players: board.players,
    });
}));

/**
 * Les pronostics déposés des membres, dans le périmètre du groupe — la matière
 * à commenter.
 *
 * Les brouillons n'y sont jamais : ce sont des hésitations, elles restent
 * privées jusqu'au dépôt, à l'intérieur d'un groupe comme ailleurs.
 */
groupRouter.get('/:slug/predictions', loadGroup, guard(async (req, res) => {
    const eventIds = scopeEvents(req.group, req.groupEventIds, req.query.event);
    if (eventIds === null) {
        return res.status(404).json({ error: 'Cet événement n’est pas suivi par le groupe.' });
    }
    if (eventIds.length === 0) return res.json({ predictions: [], configured: false });

    const kind = readKind(req.query.kind);

    const predictions = await prisma.prediction.findMany({
        where: {
            submitted: true,
            userId: { in: req.group.members.map((m) => m.userId) },
            eventId: { in: eventIds },
            ...(kind ? { category: { kind } } : {}),
            // Un événement passé en brouillon après coup cesse d'être visible, même
            // s'il figure encore au périmètre du groupe.
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
            user: {
                select: {
                    id: true,
                    username: true,
                    globalName: true,
                    avatarUrl: true,
                    equippedFrame: true,
                    equippedNameFx: true,
                },
            },
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
        configured: true,
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
        // Le rôle est nécessaire : c'est le propriétaire, et lui seul, qu'on
        // prévient de l'arrivée.
        include: { members: { select: { userId: true, role: true } } },
    });

    if (!group) return res.status(404).json({ error: 'Cette invitation n’est pas valide.' });

    if (group.members.some((m) => m.userId === req.user.id)) {
        // Déjà membre : ce n'est pas une erreur, c'est quelqu'un qui a recliqué sur
        // le lien. On le renvoie chez lui, sans prévenir personne.
        return res.json({ slug: group.slug, joined: false });
    }

    if (!group.inviteOpen) {
        return res.status(403).json({ error: 'Les inscriptions à ce groupe sont fermées.' });
    }
    if (group.members.length >= MAX_MEMBERS) {
        return res.status(409).json({ error: `Ce groupe est complet (${MAX_MEMBERS} membres).` });
    }

    const mine = await prisma.groupMember.count({ where: { userId: req.user.id } });
    if (mine >= MAX_GROUPS_PER_USER) {
        return res.status(409).json({
            error: `Vous êtes déjà dans ${MAX_GROUPS_PER_USER} groupes. Quittez-en un pour rejoindre celui-ci.`,
        });
    }

    await prisma.groupMember.create({
        data: { groupId: group.id, userId: req.user.id, role: 'MEMBER' },
    });

    // Après l'adhésion, jamais avant : un avis annonçant une arrivée qui a
    // échoué serait pire que pas d'avis du tout. La fonction avale ses propres
    // erreurs — perdre l'adhésion parce que la notification a échoué n'aurait
    // aucun sens.
    await notifyGroupJoin({ group, actorId: req.user.id });

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

/**
 * L'ancre d'une bulle.
 *
 * Une clé lisible et bornée : « rank:<phaseId>:<contenderId> »,
 * « battle:<phaseId>:<ROUND>:<slot> », « podium:<rang> ». Le serveur ne vérifie
 * PAS qu'elle correspond à un élément réel du pronostic — il faudrait rejouer
 * toute la composition de la fiche à chaque commentaire, pour un cas que le
 * client sait dégrader : une ancre introuvable retombe dans le fil général.
 *
 * Ce qui est vérifié, c'est la forme : longueur bornée, alphabet restreint,
 * fractions dans [0,1].
 */
const anchor = z.object({
    anchorKey: z
        .string()
        .max(120)
        .regex(/^[A-Za-z0-9:_-]+$/)
        .optional()
        .nullable(),
    anchorX: z.number().min(0).max(1).optional().nullable(),
    anchorY: z.number().min(0).max(1).optional().nullable(),
});

const commentInput = anchor.extend({
    body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});

/**
 * Vérifie qu'un pronostic est commentable dans ce groupe.
 *
 * Trois conditions, et les trois comptent. Le pronostic doit être DÉPOSÉ — un
 * brouillon reste privé. Son auteur doit être MEMBRE du groupe. Et son
 * événement doit figurer au PÉRIMÈTRE : sans cela, un identifiant collé dans
 * l'URL rouvrirait la porte à tout ce que le périmètre venait de refermer.
 */
async function commentablePrediction(group, groupEventIds, predictionId) {
    if (groupEventIds.length === 0) return null;

    const prediction = await prisma.prediction.findUnique({
        where: { id: predictionId },
        select: {
            id: true,
            userId: true,
            eventId: true,
            submitted: true,
            event: { select: { status: true } },
        },
    });

    if (!prediction || !prediction.submitted) return null;
    if (prediction.event.status === 'DRAFT') return null;
    if (!groupEventIds.includes(prediction.eventId)) return null;
    if (!group.members.some((m) => m.userId === prediction.userId)) return null;
    return prediction;
}

const shape = (c, userId, role) => ({
    id: c.id,
    body: c.body,
    anchorKey: c.anchorKey,
    anchorX: c.anchorX,
    anchorY: c.anchorY,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    author: c.author,
    mine: c.authorId === userId,
    // Le propriétaire fait le ménage dans son groupe ; chacun efface le sien.
    canDelete: c.authorId === userId || role === 'OWNER',
});

groupRouter.get('/:slug/predictions/:predictionId/comments', loadGroup, guard(async (req, res) => {
    const prediction = await commentablePrediction(req.group, req.groupEventIds, req.params.predictionId);
    if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable dans ce groupe.' });

    const comments = await prisma.groupComment.findMany({
        where: { groupId: req.group.id, predictionId: prediction.id },
        orderBy: { createdAt: 'asc' },
        include: {
            author: {
                select: {
                    id: true,
                    username: true,
                    globalName: true,
                    avatarUrl: true,
                    equippedFrame: true,
                    equippedNameFx: true,
                },
            },
        },
    });

    res.json({ comments: comments.map((c) => shape(c, req.user.id, req.membership.role)) });
}));

/* --- Les tampons -----------------------------------------------------------
 *
 * Chacun peut poser SON tampon sur le pronostic d'un autre membre. C'est un
 * geste social et non une annotation : un tampon ne dit rien de précis, il dit
 * « je suis passé et j'en pense quelque chose ».
 *
 * Un seul par personne et par pronostic. C'est l'unicité qui donne son sens au
 * geste : sans elle, un membre couvrirait une fiche de vingt tampons et la
 * rendrait illisible ; avec elle, un mur de tampons est un mur de signatures.
 * Reposer le sien le DÉPLACE — c'est ce qu'on attend en cliquant ailleurs.
 * -------------------------------------------------------------------------- */

const stampInput = z.object({
    itemId: z.string().min(1).max(60),
    // En fractions bornées, jamais en pixels : la fiche n'a pas la même largeur
    // sur un téléphone et sur un écran large. Bornées ici et pas seulement dans
    // l'interface — une API ne se fie pas à son client.
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
});

groupRouter.get('/:slug/predictions/:predictionId/stamps', loadGroup, guard(async (req, res) => {
    const prediction = await commentablePrediction(req.group, req.groupEventIds, req.params.predictionId);
    if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable dans ce groupe.' });

    const stamps = await prisma.groupStamp.findMany({
        where: { groupId: req.group.id, predictionId: prediction.id },
        orderBy: { createdAt: 'asc' },
        include: {
            author: {
                select: {
                    id: true,
                    username: true,
                    globalName: true,
                    avatarUrl: true,
                    equippedFrame: true,
                    equippedNameFx: true,
                },
            },
        },
    });

    res.json({
        stamps: stamps.map((s) => ({
            id: s.id,
            itemId: s.itemId,
            x: s.x,
            y: s.y,
            createdAt: s.createdAt,
            author: s.author,
            mine: s.authorId === req.user.id,
        })),
    });
}));

groupRouter.put('/:slug/predictions/:predictionId/stamp', loadGroup, guard(async (req, res) => {
    const prediction = await commentablePrediction(req.group, req.groupEventIds, req.params.predictionId);
    if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable dans ce groupe.' });

    const { itemId, x, y } = stampInput.parse(req.body ?? {});

    // On ne pose que ce qu'on possède. Le contrôle est ici et non dans
    // l'interface : sans lui, n'importe quel identifiant de tampon posté à la
    // main donnerait le tampon le plus cher du catalogue à tout le monde.
    const item = itemById(itemId);
    if (!item || item.slot !== 'stamp') {
        return res.status(400).json({ error: 'Ce tampon n\'existe pas.' });
    }
    if (item.price > 0) {
        const owned = await prisma.walletEntry.findFirst({
            where: { userId: req.user.id, kind: 'PURCHASE', itemId },
            select: { id: true },
        });
        if (!owned) return res.status(403).json({ error: 'Vous ne possédez pas ce tampon.' });
    }

    const stamp = await prisma.groupStamp.upsert({
        where: {
            groupId_predictionId_authorId: {
                groupId: req.group.id,
                predictionId: prediction.id,
                authorId: req.user.id,
            },
        },
        // Reposer déplace : on met à jour la position ET l'objet, puisqu'on a pu
        // changer de tampon entre-temps.
        update: { itemId, x, y },
        create: {
            groupId: req.group.id,
            predictionId: prediction.id,
            authorId: req.user.id,
            itemId,
            x,
            y,
        },
    });

    res.json({ stamp: { id: stamp.id, itemId, x, y, mine: true } });
}));

groupRouter.delete('/:slug/predictions/:predictionId/stamp', loadGroup, guard(async (req, res) => {
    // Chacun retire le sien. Le propriétaire du groupe ne fait PAS le ménage
    // ici, contrairement aux commentaires : un tampon ne porte pas de texte, il
    // n'y a rien à modérer, et pouvoir effacer la marque d'un autre ouvrirait
    // une petite guerre pour un geste censé être léger.
    await prisma.groupStamp.deleteMany({
        where: {
            groupId: req.group.id,
            predictionId: req.params.predictionId,
            authorId: req.user.id,
        },
    });
    res.json({ ok: true });
}));

groupRouter.post('/:slug/predictions/:predictionId/comments', loadGroup, guard(async (req, res) => {
    const prediction = await commentablePrediction(req.group, req.groupEventIds, req.params.predictionId);
    if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable dans ce groupe.' });

    const { body, anchorKey, anchorX, anchorY } = commentInput.parse(req.body ?? {});

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
            // Une ancre est un tout : sans clé, les coordonnées ne désignent rien.
            anchorKey: anchorKey || null,
            anchorX: anchorKey ? anchorX ?? 0.5 : null,
            anchorY: anchorKey ? anchorY ?? 0.5 : null,
        },
        include: {
            author: {
                select: {
                    id: true,
                    username: true,
                    globalName: true,
                    avatarUrl: true,
                    equippedFrame: true,
                    equippedNameFx: true,
                },
            },
        },
    });

    // Après l'écriture : la liste des participants au fil inclut alors le
    // commentaire qu'on vient de poser, et l'auteur en est écarté sur place.
    await notifyComment({
        groupId: req.group.id,
        predictionId: prediction.id,
        authorId: req.user.id,
        predictionOwnerId: prediction.userId,
    });

    res.status(201).json({ comment: shape(comment, req.user.id, req.membership.role) });
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

    // Le texte seul se modifie. Déplacer une bulle après coup changerait le sens
    // de la conversation : les réponses en dessous répondent à ce qui était visé.
    // Et aucune notification : une correction de faute de frappe n'est pas un
    // événement, la pastille rouge doit rester rare pour vouloir dire quelque
    // chose.
    const { body } = z
        .object({ body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH) })
        .parse(req.body ?? {});

    const updated = await prisma.groupComment.update({
        where: { id: comment.id },
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