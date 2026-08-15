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

        const [predictions, submitted, points, postbox, visits, firstVisit] = await Promise.all([
            prisma.prediction.count({ where: { userId } }),
            prisma.prediction.count({ where: { userId, submitted: true } }),
            prisma.prediction.aggregate({ where: { userId, submitted: true }, _sum: { points: true } }),
            prisma.postboxMessage.count({ where: { userId } }),
            prisma.visit.count({ where: { userId } }),
            prisma.visit.findFirst({ where: { userId }, orderBy: { day: 'asc' }, select: { day: true } }),
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
                // Le propriétaire ne peut pas se supprimer : plus personne ne pourrait
                // administrer le site, et aucune procédure ne permettrait de rouvrir la
                // porte. Il doit d'abord transmettre le rôle.
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

        const [user, predictions, postbox, visits] = await Promise.all([
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

        // Une seule instruction : les suppressions en cascade déclarées dans le
        // schéma emportent pronostics, classements pronostiqués, affiches,
        // podiums, messages de la boîte à idées et journées de visite. Les écrire à
        // la main ici créerait une seconde vérité, qui prendrait du retard au
        // premier modèle ajouté.
        await prisma.user.delete({ where: { id: req.user.id } });

        clearSession(res);
        console.log(`[compte] suppression de ${req.user.username} (${req.user.discordId}).`);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});