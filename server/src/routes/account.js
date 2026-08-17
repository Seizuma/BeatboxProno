import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { clearSession } from '../lib/auth.js';

/**
 * Le compte : ce qu'on en sait, ce qu'on peut en emporter, et comment le faire
 * disparaître.
 *
 * La suppression est un droit, pas une faveur : elle ne demande aucune
 * justification, ne passe par aucune validation manuelle, et s'exécute
 * immédiatement. La seule friction est la confirmation par saisie du pseudo,
 * qui protège contre le clic accidentel, pas contre la décision.
 */
export const accountRouter = Router();

accountRouter.use(requireAuth);

/**
 * Ce que la suppression emportera.
 *
 * Compté par le serveur et non redit côté écran : deux formulations finiraient
 * par diverger, et c'est celle de l'écran qu'on croirait.
 */
accountRouter.get('/impact', async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [predictions, submitted, points, postbox, visits, firstVisit, groupsOwned, memberships, comments] =
            await Promise.all([
                prisma.prediction.count({ where: { userId } }),
                prisma.prediction.count({ where: { userId, submitted: true } }),
                prisma.prediction.aggregate({ where: { userId, submitted: true }, _sum: { points: true } }),
                prisma.postboxMessage.count({ where: { userId } }),
                prisma.visit.count({ where: { userId } }),
                prisma.visit.findFirst({ where: { userId }, orderBy: { day: 'asc' }, select: { day: true } }),
                prisma.groupMember.count({ where: { userId, role: 'OWNER' } }),
                prisma.groupMember.count({ where: { userId } }),
                prisma.groupComment.count({ where: { authorId: userId } }),
            ]);

        res.json({
            impact: {
                username: req.user.username,
                memberSince: req.user.createdAt,
                predictions,
                submitted,
                drafts: predictions - submitted,
                points: points._sum.points ?? 0,
                postbox,
                visits,
                firstVisit: firstVisit?.day ?? null,
                // Les groupes ne bloquent pas la suppression : ceux qu'on possède
                // passent au plus ancien membre restant, et ne disparaissent que
                // s'il ne reste personne. On l'annonce quand même — quelqu'un qui
                // administre un cercle a le droit de savoir ce qu'il en advient.
                groups: memberships,
                groupsOwned,
                comments,
                // Le propriétaire du SITE, lui, ne peut pas se supprimer : plus
                // personne ne pourrait administrer, et aucune procédure ne
                // permettrait de rouvrir la porte. Il doit d'abord transmettre le rôle.
                blocked: req.user.role === 'OWNER' ? 'OWNER' : null,
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Tout ce que le site détient sur la personne, en un fichier.
 *
 * Le pendant nécessaire de la suppression : partir en emportant ses pronostics
 * plutôt qu'en les perdant. Rien ici n'est calculé pour la circonstance — c'est
 * la base telle quelle, moins les identifiants internes des autres.
 */
accountRouter.get('/export', async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [user, predictions, postbox, visits, memberships, comments] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    discordId: true,
                    username: true,
                    globalName: true,
                    avatarUrl: true,
                    role: true,
                    createdAt: true,
                    lastSeenAt: true,
                },
            }),
            prisma.prediction.findMany({
                where: { userId },
                include: {
                    event: { select: { name: true, year: true, slug: true } },
                    category: { select: { name: true } },
                    ranks: { select: { rank: true, contenderId: true } },
                    battles: {
                        select: { round: true, slot: true, contenderAId: true, contenderBId: true, winnerId: true, scoreA: true, scoreB: true },
                    },
                    podium: { select: { rank: true, contenderId: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.postboxMessage.findMany({
                where: { userId },
                select: { kind: true, body: true, createdAt: true },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.visit.findMany({ where: { userId }, select: { day: true }, orderBy: { day: 'asc' } }),
            // Les groupes : leur nom et le rôle qu'on y tient. Pas la liste des
            // autres membres — ce sont leurs données, pas les siennes.
            prisma.groupMember.findMany({
                where: { userId },
                select: { role: true, joinedAt: true, group: { select: { name: true } } },
                orderBy: { joinedAt: 'asc' },
            }),
            // Ses propres commentaires, avec le groupe où ils ont été écrits.
            prisma.groupComment.findMany({
                where: { authorId: userId },
                select: {
                    body: true,
                    createdAt: true,
                    editedAt: true,
                    group: { select: { name: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="beatboxpredictions-${user.username}.json"`
        );
        res.send(
            JSON.stringify(
                {
                    exportedAt: new Date().toISOString(),
                    account: user,
                    predictions,
                    postbox,
                    visitedDays: visits.map((v) => v.day),
                    groups: memberships.map((m) => ({
                        name: m.group.name,
                        role: m.role,
                        joinedAt: m.joinedAt,
                    })),
                    comments: comments.map((c) => ({
                        group: c.group.name,
                        body: c.body,
                        createdAt: c.createdAt,
                        editedAt: c.editedAt,
                    })),
                },
                null,
                2
            )
        );
    } catch (err) {
        next(err);
    }
});

const confirmation = z.object({
    // Saisir son pseudo est la seule friction : elle arrête le clic accidentel,
    // pas la décision. On ne demande ni motif ni confirmation par courriel.
    username: z.string(),
});

/**
 * Transmet les groupes possédés avant que le compte disparaisse.
 *
 * La cascade du schéma efface l'adhésion en même temps que la personne, ce qui
 * laisserait un groupe sans propriétaire : plus personne pour inviter, exclure
 * ou dissoudre, et rien dans l'application pour réparer ça. Le titre passe donc
 * au plus ancien membre restant. Le groupe n'est dissous que s'il ne reste
 * personne — supprimer le cercle de cinq amis parce que son créateur s'en va
 * détruirait leur classement sans qu'ils aient rien demandé.
 *
 * L'ordre compte : l'index partiel interdit deux propriétaires, donc l'ancien
 * est rétrogradé avant que le nouveau soit promu.
 */
async function handOverGroups(tx, userId) {
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

accountRouter.delete('/', async (req, res, next) => {
    try {
        if (req.user.role === 'OWNER') {
            return res.status(409).json({
                error:
                    "Le compte propriétaire ne peut pas être supprimé : plus personne ne pourrait administrer le site. Transmettez d'abord le rôle.",
            });
        }

        const { username } = confirmation.parse(req.body ?? {});
        if (username.trim() !== req.user.username) {
            return res.status(400).json({ error: 'Le pseudo saisi ne correspond pas.' });
        }

        // La suppression et la transmission des groupes forment un tout : un
        // échec à mi-chemin laisserait soit un compte fantôme, soit un cercle
        // sans personne aux commandes.
        //
        // Le reste part en cascade, comme déclaré au schéma : pronostics,
        // classements pronostiqués, affiches, podiums, messages de la boîte à
        // idées, journées de visite, adhésions et commentaires. Les écrire à la
        // main ici créerait une seconde vérité, qui prendrait du retard au
        // premier modèle ajouté.
        await prisma.$transaction(async (tx) => {
            await handOverGroups(tx, req.user.id);
            await tx.user.delete({ where: { id: req.user.id } });
        });

        clearSession(res);
        console.log(`[compte] suppression de ${req.user.username} (${req.user.discordId}).`);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});