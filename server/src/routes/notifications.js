import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { listNotifications } from '../lib/notifications.js';

/**
 * La cloche.
 *
 * Trois routes, pas une de plus : lire, marquer un avis, tout marquer. Pas de
 * pagination — au-delà de trente avis en attente, ce n'est plus une liste à
 * lire mais un rattrapage, et « tout marquer comme lu » est le geste utile.
 */
export const notificationRouter = Router();

const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

notificationRouter.use(requireAuth);

notificationRouter.get('/', guard(async (req, res) => {
    res.json(await listNotifications(req.user.id));
}));

/**
 * Marque un avis comme lu.
 *
 * `updateMany` avec le destinataire dans le filtre plutôt qu'`update` sur
 * l'identifiant : ainsi un identifiant appartenant à quelqu'un d'autre ne
 * touche rien, et on n'a pas à charger la ligne pour vérifier à qui elle est.
 */
notificationRouter.post('/:id/read', guard(async (req, res) => {
    await prisma.notification.updateMany({
        where: { id: req.params.id, userId: req.user.id, readAt: null },
        data: { readAt: new Date() },
    });
    res.json({ ok: true });
}));

notificationRouter.post('/read', guard(async (req, res) => {
    await prisma.notification.updateMany({
        where: { userId: req.user.id, readAt: null },
        data: { readAt: new Date() },
    });
    res.json({ ok: true });
}));