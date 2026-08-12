import {
    GAP_MAX_BONUS,
    BATTLE_HAPPENED,
    BATTLE_WINNER,
    BATTLE_SCORE,
    QUALIFIED_POINT,
} from './scoring.js';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];

/**
 * Le score qu'un pronostic parfait obtiendrait sur une catégorie.
 *
 * Sert à vérifier le barème avant d'ouvrir un événement : si le total annoncé
 * ne correspond pas à ce qu'on attend, c'est que la structure est mal montée
 * — une phase oubliée, un nombre de qualifiés incohérent.
 *
 * Le calcul suit exactement le même barème que `scorePrediction`, mais en
 * supposant que tout est deviné juste. Les points ne dépendent que de la
 * STRUCTURE (nombre de participants, de qualifiés, d'affiches) et non des
 * résultats : le maximum est donc connu dès la création de l'événement.
 */
export function maxScoreForCategory(category) {
    const lines = [];
    let total = 0;

    for (const phase of category.phases ?? []) {
        if (RANKING_TYPES.includes(phase.type)) {
            const runners = category.contenders?.length ?? 0;

            // Écart nul sur chaque participant : le maximum du barème de placement.
            const gap = runners * GAP_MAX_BONUS;

            // Le point de qualification ne va qu'aux contenders RÉELLEMENT qualifiés
            // (`actual.qualified` dans scoreRankingPhase), donc au plus la coupe —
            // et jamais à l'ensemble des participants.
            //
            // Deux cas où la phase n'en distribue aucun : le barème réserve ces
            // points aux types WILDCARD et ELIMINATION, et une phase sans coupe, ou
            // dont la coupe couvre tout le plateau, n'élimine personne.
            const countsQualification = phase.type === 'WILDCARD' || phase.type === 'ELIMINATION';
            const cut = phase.qualifierCount ?? 0;
            const qualifies = countsQualification && cut > 0 && cut < runners ? cut : 0;
            const qualification = qualifies * QUALIFIED_POINT;

            const points = gap + qualification;

            lines.push({
                phaseId: phase.id,
                phase: phase.name,
                type: phase.type,
                detail: qualifies
                    ? `${runners} × ${GAP_MAX_BONUS} (placement) + ${qualifies} × ${QUALIFIED_POINT} (qualification)`
                    : `${runners} × ${GAP_MAX_BONUS} (placement)` +
                    (countsQualification && cut >= runners && runners > 0
                        ? ' — personne n\'est éliminé, aucun point de qualification'
                        : ''),
                points,
            });
            total += points;
            continue;
        }

        // Phase à affiches : chaque battle vaut au mieux affiche + vainqueur + score.
        const battles = phase.battles?.length ?? 0;
        const perBattle = BATTLE_HAPPENED + BATTLE_WINNER + BATTLE_SCORE;
        const points = battles * perBattle;

        lines.push({
            phaseId: phase.id,
            phase: phase.name,
            type: phase.type,
            detail: `${battles} affiches × ${perBattle} (${BATTLE_HAPPENED} affiche + ${BATTLE_WINNER} vainqueur + ${BATTLE_SCORE} score)`,
            points,
        });
        total += points;
    }

    return { category: category.name, categoryId: category.id, total, lines };
}

/** Le maximum d'un événement entier, catégorie par catégorie. */
export function maxScoreForEvent(event) {
    const categories = (event.categories ?? []).map(maxScoreForCategory);
    return {
        total: categories.reduce((n, c) => n + c.total, 0),
        categories,
    };
}