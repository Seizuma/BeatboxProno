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
            badgeSet: true,
            awardsCredits: true,
            categories: { select: { phases: { select: { resolved: true } } } },
        },
    });
    if (!event) return { players: 0, badges: 0, credits: 0, skipped: 'introuvable' };

    /**
     * ─── Le garde-fou : aucun résultat publié ───────────────────────────────
     *
     * Il précède les deux réglages parce qu'il ne se discute pas. C'est la
     * cause de l'incident du 9 septembre : une compète passée en « terminé »
     * avant publication a distribué quarante badges sur des scores tous à zéro,
     * le classement se réduisant à l'ordre d'insertion en base.
     *
     * Rien n'est perdu : la clôture est rejouable. Publier puis repasser par
     * « terminé » pose le vrai palmarès, et le crédit est un UPSERT — il se
     * corrige au lieu de s'empiler.
     */
    const published = event.categories.some((c) => c.phases.some((p) => p.resolved));
    if (!published) return { players: 0, badges: 0, credits: 0, skipped: 'aucun-resultat' };

    /**
     * ─── Deux distributions indépendantes ───────────────────────────────────
     *
     * Un seul booléen commandait les deux, ce qui obligeait à renoncer aux
     * points de boutique pour se débarrasser des médailles. Un championnat peut
     * parfaitement rapporter des points sans décerner les médailles d'une autre
     * compétition — c'est même le cas courant.
     *
     * `badgeSet` désigne une FAMILLE de dessins, `null` n'en désigne aucune.
     * Le serveur ne connaît pas le catalogue : il enregistre le code du badge,
     * et c'est le client qui sait quel cube dessiner pour la famille de la
     * compète. Cette ignorance est voulue — ajouter une famille ne doit
     * demander ni migration ni redéploiement du serveur.
     */
    const wantsBadges = Boolean(event.badgeSet);
    const wantsCredits = event.awardsCredits;
    if (!wantsBadges && !wantsCredits) {
        return { players: 0, badges: 0, credits: 0, skipped: 'rien-a-distribuer' };
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
    if (wantsBadges) {
        for (const r of ranked) {
            // La participation se gagne en déposant, pas en marquant : quelqu'un
            // à zéro point a quand même joué le jeu.
            awards.push({ userId: r.userId, eventId, code: 'PARTICIPANT' });

            // Le plus haut palier seulement : un Gold n'empile pas Silver et
            // Bronze, le mur de badges se lit compète par compète.
            const tier = tierForPosition(r.position, total);
            if (tier) awards.push({ userId: r.userId, eventId, code: tier });

            if (r.position <= 3) {
                awards.push({ userId: r.userId, eventId, code: `PODIUM_${r.position}` });
            }
        }
    }

    /**
     * Les badges de la compète sont TOUJOURS effacés d'abord, même quand elle
     * n'en décerne plus.
     *
     * C'est ce qui rend le réglage rétroactif : retirer la famille de dessins
     * d'une compète et rejouer la clôture nettoie ce qu'elle avait distribué,
     * au lieu de laisser des médailles orphelines qu'il faudrait aller chercher
     * à la main.
     *
     * Le crédit suit la même logique en sens inverse : il est SUPPRIMÉ quand la
     * compète ne crédite plus, et remis à jour sinon. Un `upsert` seul aurait
     * laissé en place le crédit d'une compète qu'on vient de démonétiser.
     */
    const ops = [prisma.badgeAward.deleteMany({ where: { eventId } })];
    if (awards.length > 0) {
        ops.push(prisma.badgeAward.createMany({ data: awards, skipDuplicates: true }));
    }

    if (wantsCredits) {
        ops.push(
            ...ranked.map((r) =>
                prisma.walletEntry.upsert({
                    where: { userId_eventId: { userId: r.userId, eventId } },
                    update: { amount: r.points },
                    create: { userId: r.userId, eventId, kind: 'EVENT_POINTS', amount: r.points },
                })
            )
        );
    } else {
        ops.push(prisma.walletEntry.deleteMany({ where: { eventId, kind: 'EVENT_POINTS' } }));
    }

    await prisma.$transaction(ops);

    return {
        players: total,
        badges: awards.length,
        credits: wantsCredits ? total : 0,
        badgeSet: event.badgeSet,
    };
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