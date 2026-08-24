import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { listNotifications } from '../lib/notifications.js';

/**
 * La cloche.
 *
 * Deux choses y cohabitent, et elles n'ont pas la même nature. Les
 * NOTIFICATIONS sont des événements — quelqu'un a rejoint, quelqu'un a
 * commenté — qui s'accumulent et se marquent un par un. Le JOURNAL DES
 * NOUVEAUTÉS est un document unique et permanent : il ne s'accumule pas, il
 * s'allonge, et il reste consultable indéfiniment une fois lu.
 *
 * D'où l'asymétrie de traitement : les premières vivent en lignes de base, le
 * second n'y laisse qu'un curseur — l'identifiant de la dernière note lue. Le
 * texte des notes vit dans le code du client, versionné avec les changements
 * qu'il décrit et traduit comme le reste du site.
 *
 * Le décompte des nouveautés se fait donc CÔTÉ CLIENT : lui seul connaît la
 * liste des notes publiées. Le serveur se contente de dire jusqu'où la personne
 * avait lu, et de retenir la nouvelle position.
 */
export const notificationRouter = Router();

const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

notificationRouter.use(requireAuth);

notificationRouter.get('/', guard(async (req, res) => {
    const [payload, me] = await Promise.all([
        listNotifications(req.user.id),
        prisma.user.findUnique({
            where: { id: req.user.id },
            select: { lastReadRelease: true },
        }),
    ]);

    // Rendu dans la même réponse que les notifications : la cloche n'a qu'une
    // requête à faire, et son relevé périodique ne double pas pour un curseur qui
    // change une fois par déploiement.
    res.json({ ...payload, lastReadRelease: me?.lastReadRelease ?? null });
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

/**
 * Enregistre jusqu'où la personne a lu le journal des nouveautés.
 *
 * Le serveur ne vérifie pas que l'identifiant correspond à une note existante :
 * il n'en a pas la liste, elle vit côté client. Ce qu'il contrôle, c'est la
 * FORME — une date ISO courte — pour qu'une chaîne arbitraire ne finisse pas
 * stockée puis réaffichée.
 *
 * Le curseur n'avance jamais à reculons : relire une ancienne note ne doit pas
 * faire réapparaître les suivantes comme neuves. La comparaison de chaînes
 * suffit, les identifiants étant des dates ISO — leur ordre lexicographique est
 * chronologique.
 */
notificationRouter.post('/release', guard(async (req, res) => {
    const id = String(req.body?.id ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) {
        return res.status(400).json({ error: 'Identifiant de note invalide.' });
    }

    const me = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { lastReadRelease: true },
    });

    const current = me?.lastReadRelease ?? '';
    if (id > current) {
        await prisma.user.update({
            where: { id: req.user.id },
            data: { lastReadRelease: id },
        });
    }

    res.json({ lastReadRelease: id > current ? id : current || null });
}));