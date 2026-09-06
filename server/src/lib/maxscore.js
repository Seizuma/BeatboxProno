import { isWildcardCategory } from './wildcard.js';
import {
    GAP_MAX_BONUS,
    BATTLE_HAPPENED,
    BATTLE_WINNER,
    BATTLE_SCORE,
    QUALIFIED_POINT,
    FINAL_FOUR_POINTS,
    WILDCARD_HIT,
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

    // Dans une compétition de wildcards, la qualification vaut trois points au
    // lieu d'un. Le maximum doit le savoir, sinon la précision d'un pronostic
    // parfait dépasse cent pour cent — c'est exactement le défaut qu'on a mis
    // deux jours à trouver sur le Crew.
    const hitValue = isWildcardCategory(category) ? WILDCARD_HIT : QUALIFIED_POINT;

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
            const qualification = qualifies * hitValue;

            const points = gap + qualification;

            lines.push({
                phaseId: phase.id,
                phase: phase.name,
                type: phase.type,
                detail: qualifies
                    ? `${runners} × ${GAP_MAX_BONUS} (placement) + ${qualifies} × ${hitValue} (qualification)`
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

        /**
         * Le top 4 final, une fois par tableau.
         *
         * Il dépend de la STRUCTURE et non des résultats, comme le reste de ce
         * fichier : une finale existe ou n'existe pas, une petite finale aussi.
         * Un format sans petite finale ne vaut donc que 9 points ici au lieu de
         * 14 — et c'est un argument de plus pour en ajouter une, ce que l'écran
         * de format sait faire depuis peu.
         */
        if (phase.type === 'BRACKET') {
            const rounds = new Set((phase.battles ?? []).map((b) => b.round));
            const places = [];
            if (rounds.has('FINAL')) places.push(FINAL_FOUR_POINTS[0], FINAL_FOUR_POINTS[1]);
            if (rounds.has('FINAL') && rounds.has('SMALL_FINAL')) {
                places.push(FINAL_FOUR_POINTS[2], FINAL_FOUR_POINTS[3]);
            }

            if (places.length) {
                const four = places.reduce((n, p) => n + p, 0);
                lines.push({
                    phaseId: `${phase.id}-four`,
                    phase: `${phase.name} — top 4`,
                    type: 'FINAL_FOUR',
                    detail:
                        places.join(' + ') +
                        (places.length === 2
                            ? ' (pas de petite finale : ni 3e ni 4e place)'
                            : ' (vainqueur, finaliste, 3e, 4e)'),
                    points: four,
                });
                total += four;
            }
        }
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