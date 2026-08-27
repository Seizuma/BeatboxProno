import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { ITEMS, SLOTS, itemById, slotById } from '../lib/cosmetics.js';
import { walletBalance } from '../lib/badges.js';

export const shopRouter = Router();

/**
 * Express 4 avale les rejets d'un handler asynchrone : la requête reste
 * suspendue jusqu'au délai d'expiration, sans une ligne de log.
 */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Ce que le client reçoit après chaque opération : l'état complet, jamais un delta. */
async function snapshot(userId) {
    if (!userId) {
        return { balance: 0, owned: [], equipped: {}, items: ITEMS.length };
    }

    const [entries, user] = await Promise.all([
        prisma.walletEntry.findMany({
            where: { userId, kind: 'PURCHASE' },
            select: { itemId: true },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: Object.fromEntries(SLOTS.map((s) => [s.column, true])),
        }),
    ]);

    const equipped = {};
    for (const slot of SLOTS) equipped[slot.id] = user?.[slot.column] ?? null;

    return {
        balance: await walletBalance(userId),
        owned: entries.map((e) => e.itemId).filter(Boolean),
        equipped,
        items: ITEMS.length,
    };
}

/**
 * La vitrine. Visitable déconnecté : quelqu'un qui découvre le site doit
 * pouvoir voir ce qu'il y a à gagner avant de décider s'il s'inscrit.
 */
shopRouter.get('/', guard(async (req, res) => {
    res.json(await snapshot(req.user?.id ?? null));
}));

/**
 * L'achat.
 *
 * Tout tient dans une transaction interactive parce que le solde doit être lu
 * ET la ligne écrite sans que rien ne s'intercale : deux onglets ouverts sur la
 * même boutique, et un porte-monnaie de cent points paie deux objets à cent.
 * L'unicité (userId, itemId) attrape le doublon même si la vérification passe.
 */
shopRouter.post('/buy', requireAuth, guard(async (req, res) => {
    const { itemId } = z.object({ itemId: z.string() }).parse(req.body);
    const item = itemById(itemId);
    if (!item) return res.status(404).json({ error: 'Objet inconnu.' });

    // Un objet gratuit n'a pas besoin d'une ligne d'achat : il appartient à tout
    // le monde par définition, et une ligne à zéro polluerait le livre.
    if (item.price === 0) return res.json(await snapshot(req.user.id));

    try {
        await prisma.$transaction(async (tx) => {
            const owned = await tx.walletEntry.findFirst({
                where: { userId: req.user.id, itemId },
                select: { id: true },
            });
            if (owned) { const e = new Error('owned'); e.code = 409; throw e; }

            const lines = await tx.walletEntry.findMany({
                where: { userId: req.user.id },
                select: { amount: true },
            });
            const balance = lines.reduce((n, l) => n + l.amount, 0);
            if (balance < item.price) { const e = new Error('poor'); e.code = 402; throw e; }

            await tx.walletEntry.create({
                data: {
                    userId: req.user.id,
                    kind: 'PURCHASE',
                    amount: -item.price,
                    itemId,
                },
            });
        });
    } catch (err) {
        if (err.code === 409) return res.status(409).json({ error: 'Objet déjà possédé.' });
        if (err.code === 402) return res.status(402).json({ error: 'Solde insuffisant.' });
        throw err;
    }

    res.json(await snapshot(req.user.id));
}));

/**
 * L'équipement.
 *
 * `itemId` peut être nul : c'est le retrait. Un emplacement vide est un état
 * légitime, pas une erreur — et c'est la seule façon de revenir en arrière sans
 * racheter quoi que ce soit.
 */
shopRouter.post('/equip', requireAuth, guard(async (req, res) => {
    const body = z.object({
        slot: z.string(),
        itemId: z.string().nullable(),
    }).parse(req.body);

    const slot = slotById(body.slot);
    if (!slot) return res.status(400).json({ error: 'Emplacement inconnu.' });

    if (body.itemId) {
        const item = itemById(body.itemId);
        if (!item || item.slot !== slot.id) {
            return res.status(400).json({ error: "Cet objet ne va pas dans cet emplacement." });
        }
        // On vérifie la possession côté serveur et pas seulement côté bouton :
        // la route est publique, l'interface ne protège rien.
        if (item.price > 0) {
            const owned = await prisma.walletEntry.findFirst({
                where: { userId: req.user.id, itemId: item.id },
                select: { id: true },
            });
            if (!owned) return res.status(403).json({ error: 'Objet non possédé.' });
        }
    }

    await prisma.user.update({
        where: { id: req.user.id },
        data: { [slot.column]: body.itemId },
    });

    res.json(await snapshot(req.user.id));
}));