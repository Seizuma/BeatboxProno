import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { relayToDiscord } from '../lib/discord.js';

/**
 * La boîte à idées : suggestions d'événements et rapports de bug, relayés sur
 * Discord dans le salon qui va bien.
 *
 * La route s'appelle « postbox » et non « feedback » ou « contact ». Ces deux
 * mots-là figurent dans les listes de filtrage de plusieurs bloqueurs de
 * publicité, qui coupent la requête DANS le navigateur : aucune trace côté
 * serveur, et le joueur reçoit un « serveur injoignable » incompréhensible. On
 * a déjà payé ce prix sur `/stats`, inutile de recommencer.
 */
export const postboxRouter = Router();

// Réservée aux comptes connectés : sans identité Discord, ni quota ni recours.
postboxRouter.use(requireAuth);

/** Dix messages par personne et par mois civil. */
export const MONTHLY_LIMIT = 10;

/** Le premier instant du mois en cours, en UTC. */
function monthStart(now = new Date()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Le premier instant du mois suivant : la date à laquelle le quota repart. */
function monthEnd(now = new Date()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

async function quotaFor(userId) {
    const used = await prisma.postboxMessage.count({
        where: { userId, createdAt: { gte: monthStart() } },
    });
    return {
        used,
        limit: MONTHLY_LIMIT,
        remaining: Math.max(0, MONTHLY_LIMIT - used),
        resetsAt: monthEnd().toISOString(),
    };
}

/**
 * Où en est mon quota. Le formulaire l'affiche avant la saisie : mieux vaut
 * savoir qu'il ne reste rien avant d'écrire trois paragraphes qu'après.
 */
postboxRouter.get('/quota', async (req, res) => {
    res.json(await quotaFor(req.user.id));
});

/**
 * Un cran de plus que le quota mensuel : une rafale de dix messages en dix
 * secondes n'est pas un usage normal, même dans les clous du mois.
 */
const burst = rateLimit({
    windowMs: 60_000,
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    message: { error: 'Trop de messages coup sur coup. Attendez une minute.' },
});

const schema = z.object({
    kind: z.enum(['SUGGESTION', 'BUG']),
    // Vingt caractères minimum : « ça marche pas » n'est pas un rapport de bug,
    // et une ligne vide n'est pas une suggestion.
    body: z.string().trim().min(20).max(1000),
});

postboxRouter.post('/', burst, async (req, res, next) => {
    try {
        const { kind, body } = schema.parse(req.body);

        const quota = await quotaFor(req.user.id);
        if (quota.remaining === 0) {
            return res.status(429).json({
                error: `Vous avez atteint vos ${MONTHLY_LIMIT} messages du mois. Le compteur repart le 1er.`,
                quota,
            });
        }

        // La ligne est écrite AVANT l'envoi : elle porte le quota, et un webhook en
        // panne ne doit pas rendre le formulaire réutilisable à volonté.
        const message = await prisma.postboxMessage.create({
            data: { userId: req.user.id, kind, body },
        });

        const relay = await relayToDiscord({
            id: message.id,
            kind,
            body,
            user: req.user,
        });

        await prisma.postboxMessage.update({
            where: { id: message.id },
            data: { delivered: relay.ok, failure: relay.ok ? null : relay.error ?? null },
        });

        if (!relay.ok) {
            // Le message est conservé : on pourra le rejouer. Mais on le dit.
            console.error('[postbox] relais Discord échoué :', relay.error);
            return res.status(502).json({
                error:
                    "Votre message est enregistré mais n'a pas pu être transmis. Il sera relayé manuellement.",
                quota: await quotaFor(req.user.id),
            });
        }

        res.status(201).json({ ok: true, quota: await quotaFor(req.user.id) });
    } catch (err) {
        next(err);
    }
});