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
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
            awardsBadges: true,
            categories: { select: { phases: { select: { resolved: true } } } },
        },
    });
    if (!event) return { players: 0, badges: 0, skipped: 'introuvable' };

    /**
     * Deux refus, et ils ne disent pas la même chose.
     *
     * ─── La compète ne décerne pas de palmarès ──────────────────────────────
     *
     * Les badges ne sont pas propres à un événement : sept codes pour tout le
     * site, et n'importe quelle compète close les distribuait tous. Une
     * sélection de wildcards à vingt joueurs décernait les mêmes médailles
     * qu'un Grand Beatbox Battle. Rien ne permettait de dire non ; maintenant
     * si.
     *
     * ─── Aucun résultat n'est publié ────────────────────────────────────────
     *
     * Celui-là est un garde-fou, pas un réglage, et c'est la cause réelle de
     * l'incident du 9 septembre : une compète passée en « terminé » avant
     * publication a distribué quarante badges sur des scores tous à zéro. Le
     * classement se réduisait alors à l'ordre d'insertion en base, et il a
     * fallu tout reprendre à la main.
     *
     * Rien de tout cela n'est perdu : la clôture est rejouable. Publier les
     * résultats puis repasser par « terminé » distribue le vrai palmarès, et le
     * crédit est un UPSERT — il se corrige au lieu de s'empiler.
     */
    if (!event.awardsBadges) {
        return { players: 0, badges: 0, skipped: 'palmares-desactive' };
    }
    const published = event.categories.some((c) => c.phases.some((p) => p.resolved));
    if (!published) {
        return { players: 0, badges: 0, skipped: 'aucun-resultat' };
    }

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
 * Annule la clôture d'une compète : badges retirés, crédit repris.
 *
 * ─── Le geste qui manquait ──────────────────────────────────────────────────
 *
 * `settleEvent` était rejouable mais IRRÉVERSIBLE. L'en-tête de ce fichier le
 * dit franchement : « Rien n'est repris quand un événement QUITTE FINISHED ».
 * C'était un bon choix pour le cas visé — dépublier dix minutes pour corriger
 * une faute de frappe ne doit pas faire clignoter le palmarès de tout le monde.
 *
 * Mais il ne laissait aucune sortie pour le cas d'à côté : une compète close
 * par erreur, ou close alors qu'elle n'aurait pas dû distribuer de palmarès du
 * tout. Les badges et les points restaient, définitivement, sans qu'aucun écran
 * ne permette de les retirer. C'est exactement la situation où l'on se retrouve
 * quand des badges apparaissent sur une compète qui n'était pas censée en
 * donner.
 *
 * ─── Pourquoi c'est explicite et non automatique ────────────────────────────
 *
 * On ne branche PAS ceci sur la transition FINISHED → autre chose. Le
 * comportement d'origine reste : dépublier pour corriger ne touche à rien.
 * Reprendre un palmarès est une décision, pas un effet de bord — et une
 * décision qui efface le travail des joueurs se prend en cliquant, pas en
 * changeant un menu déroulant.
 *
 * ─── Le solde peut passer sous zéro ─────────────────────────────────────────
 *
 * Assumé, et déjà le cas dans `settleEvent`. Quelqu'un qui a dépensé les points
 * d'une compète annulée se retrouve débiteur : un solde négatif bloque les
 * achats suivants sans jamais confisquer un objet déjà porté. Confisquer serait
 * pire — l'erreur vient de l'organisateur, pas de l'acheteur.
 */
export async function unsettleEvent(eventId) {
    const [badges, credits] = await prisma.$transaction([
        prisma.badgeAward.deleteMany({ where: { eventId } }),
        // Le crédit de clôture SEULEMENT. Un `GRANT` posé à la main par un
        // organisateur — un dédommagement, un cadeau — n'a rien à voir avec la
        // clôture et ne doit pas partir avec elle.
        prisma.walletEntry.deleteMany({ where: { eventId, kind: 'EVENT_POINTS' } }),
    ]);

    return { badges: badges.count, credits: credits.count };
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