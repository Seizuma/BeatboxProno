import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { itemById, SHOP_ITEMS, SLOTS } from '../lib/cosmetics.js';
import { walletBalance } from '../lib/badges.js';

export const shopRouter = Router();

/** Relaie les erreurs d'un gestionnaire asynchrone vers le middleware d'erreur. */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const requireUser = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Connexion requise.' });

/**
 * La vitrine. Le catalogue part au client même déconnecté : la boutique se
 * visite comme on lèche une vitrine, seul l'achat demande une session.
 *
 * Le catalogue est AUSSI dans le bundle client (cosmetics.js dupliqué, comme
 * bracket.js) — le renvoyer ici sert de source de vérité pour les PRIX : un
 * client sur un bundle périmé pendant un déploiement affiche alors le bon
 * tarif, et le serveur reste seul juge au moment de payer.
 */
shopRouter.get('/', guard(async (req, res) => {
    if (!req.user) {
        return res.json({ items: SHOP_ITEMS, balance: null, owned: [], equipped: null });
    }

    const [balance, purchases, me] = await Promise.all([
        walletBalance(req.user.id),
        prisma.walletEntry.findMany({
            where: { userId: req.user.id, kind: 'PURCHASE' },
            select: { itemId: true },
        }),
        prisma.user.findUnique({
            where: { id: req.user.id },
            select: { equippedFrame: true, equippedTitle: true, equippedFlair: true },
        }),
    ]);

    res.json({
        items: SHOP_ITEMS,
        balance,
        owned: purchases.map((p) => p.itemId).filter(Boolean),
        equipped: me,
    });
}));

/**
 * L'achat. Vérification du solde et débit dans la MÊME transaction : deux
 * onglets qui achètent en même temps ne peuvent pas dépenser deux fois le
 * même point. L'unicité (userId, itemId) en base est la ceinture si deux
 * requêtes strictement simultanées visent le même objet.
 */
shopRouter.post('/buy', requireUser, guard(async (req, res) => {
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(req.body);

    const item = itemById(itemId);
    if (!item) return res.status(404).json({ error: 'Objet inconnu.' });

    const outcome = await prisma.$transaction(async (tx) => {
        const owned = await tx.walletEntry.findFirst({
            where: { userId: req.user.id, itemId },
            select: { id: true },
        });
        if (owned) return { status: 409, error: 'Vous possédez déjà cet objet.' };

        const agg = await tx.walletEntry.aggregate({
            where: { userId: req.user.id },
            _sum: { amount: true },
        });
        const balance = agg._sum.amount ?? 0;
        // 402 Payment Required : le code HTTP existe depuis 1997 et n'attendait
        // que ce moment.
        if (balance < item.price) return { status: 402, error: 'Solde insuffisant.' };

        await tx.walletEntry.create({
            data: { userId: req.user.id, kind: 'PURCHASE', itemId, amount: -item.price },
        });
        return { balance: balance - item.price };
    });

    if (outcome.status) return res.status(outcome.status).json({ error: outcome.error });
    res.json({ ok: true, balance: outcome.balance });
}));

/**
 * Porter ou retirer. `itemId: null` déshabille l'emplacement — retirer n'est
 * pas vendre, la possession reste dans le livre de comptes.
 */
shopRouter.post('/equip', requireUser, guard(async (req, res) => {
    const { slot, itemId } = z
        .object({
            slot: z.enum(SLOTS),
            itemId: z.string().min(1).nullable(),
        })
        .parse(req.body);

    if (itemId) {
        const item = itemById(itemId);
        // Un titre ne se porte pas en cadre : l'emplacement est une propriété de
        // l'objet, pas un choix.
        if (!item || item.slot !== slot) {
            return res.status(400).json({ error: 'Cet objet ne va pas à cet emplacement.' });
        }
        const owned = await prisma.walletEntry.findFirst({
            where: { userId: req.user.id, itemId, kind: 'PURCHASE' },
            select: { id: true },
        });
        if (!owned) return res.status(403).json({ error: 'Objet non possédé.' });
    }

    const column = {
        frame: 'equippedFrame',
        title: 'equippedTitle',
        flair: 'equippedFlair',
    }[slot];

    const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { [column]: itemId },
        select: { equippedFrame: true, equippedTitle: true, equippedFlair: true },
    });

    res.json({ ok: true, equipped: user });
}));