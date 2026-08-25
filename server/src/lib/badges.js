import { prisma } from './prisma.js';
import { tierForPosition } from './cosmetics.js';

/**
 * La clôture d'une compétition : badges et crédit du porte-monnaie.
 *
 * Appelée à la TRANSITION de l'événement vers FINISHED — la même mécanique que
 * l'annonce d'ouverture, et pour la même raison : un état se ré-enregistre,
 * une transition n'arrive qu'une fois par bascule.
 *
 * L'opération est entièrement REJOUABLE. Re-basculer LIVE → FINISHED après un
 * recalcul de points doit CORRIGER le palmarès, jamais l'empiler :
 *  - les badges de la compète sont supprimés puis intégralement recréés ;
 *  - le crédit est un UPSERT sur (personne, compète) — le montant se met à
 *    jour, la ligne ne se duplique pas. Si quelqu'un a déjà dépensé plus que
 *    son crédit corrigé, son solde peut passer sous zéro : c'est assumé, un
 *    solde négatif bloque les achats sans jamais confisquer un objet porté.
 *
 * Rien n'est repris quand un événement QUITTE FINISHED : dépublier pour
 * corriger une faute de frappe ne doit pas faire disparaître les badges de
 * tout le monde pendant dix minutes. La re-clôture remettra tout d'équerre.
 */
export async function settleEvent(eventId) {
    const grouped = await prisma.prediction.groupBy({
        by: ['userId'],
        where: { eventId, submitted: true },
        _sum: { points: true },
    });

    const rows = grouped
        .map((g) => ({ userId: g.userId, points: g._sum.points ?? 0 }))
        .sort((a, b) => b.points - a.points);

    // Classement « competition » : les ex æquo partagent la place, la suivante
    // saute (1, 2, 2, 4). Deux personnes à égalité parfaite de points reçoivent
    // donc les mêmes badges — départager sur l'ordre d'insertion serait
    // arbitraire et invérifiable.
    let position = 0;
    const ranked = rows.map((r, i) => {
        if (i === 0 || r.points < rows[i - 1].points) position = i + 1;
        return { ...r, position };
    });

    const total = ranked.length;
    const awards = [];
    for (const r of ranked) {
        // La participation se gagne en déposant, pas en marquant : quelqu'un à
        // zéro point a quand même joué le jeu.
        awards.push({ userId: r.userId, eventId, code: 'PARTICIPANT' });

        // Le plus haut palier seulement : un Gold n'empile pas Silver et Bronze,
        // le mur de badges se lit compète par compète.
        const tier = tierForPosition(r.position, total);
        if (tier) awards.push({ userId: r.userId, eventId, code: tier });

        if (r.position <= 3) {
            awards.push({ userId: r.userId, eventId, code: `PODIUM_${r.position}` });
        }
    }

    await prisma.$transaction([
        prisma.badgeAward.deleteMany({ where: { eventId } }),
        prisma.badgeAward.createMany({ data: awards, skipDuplicates: true }),
        ...ranked.map((r) =>
            prisma.walletEntry.upsert({
                where: { userId_eventId: { userId: r.userId, eventId } },
                update: { amount: r.points },
                create: { userId: r.userId, eventId, kind: 'EVENT_POINTS', amount: r.points },
            })
        ),
    ]);

    return { players: total, badges: awards.length };
}

/**
 * Le solde : la somme du livre de comptes, rien d'autre. Pas de colonne cache
 * sur User — un agrégat sur un index (userId) reste bon marché très longtemps,
 * et il ne peut pas mentir.
 */
export async function walletBalance(userId) {
    const agg = await prisma.walletEntry.aggregate({
        where: { userId },
        _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
}