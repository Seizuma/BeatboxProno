/**
 * Un score est-il cohérent avec le camp désigné vainqueur ?
 *
 * Définie ICI plutôt qu'importée de `scores.js`, et c'est délibéré.
 *
 * Ce fichier existe en deux exemplaires — `server/src/lib/` et `web/src/lib/` —
 * parce que le serveur et le client construisent des images Docker séparées :
 * aucun des deux ne peut lire dans le dossier de l'autre. Un test de parité
 * rejoue des milliers de configurations contre les deux copies pour qu'elles ne
 * divergent jamais.
 *
 * Or `scores.js` n'a de sens que côté client : il alimente les listes
 * déroulantes de score de l'administration. L'importer ici rendait les deux
 * copies impossibles à garder identiques — le serveur aurait eu besoin d'un
 * fichier dont il n'a que faire, et sans lui l'import échouait au démarrage.
 *
 * Cinq lignes recopiées valent mieux qu'une dépendance qui ne peut pas exister
 * des deux côtés. Et le bénéfice va plus loin : les deux fichiers étant
 * désormais identiques au caractère près, la parité peut se vérifier par une
 * simple comparaison d'octets, bien plus sûre qu'un tirage aléatoire.
 *
 * La règle elle-même : « sans avis » reste valide — un score absent n'est pas
 * une contradiction, c'est une abstention.
 */
function scoreMatchesWinner(scoreA, scoreB, side) {
    if (scoreA == null || scoreB == null) return true;
    if (side === 'a') return scoreA > scoreB;
    if (side === 'b') return scoreB > scoreA;
    return false;
}

/**
 * La ligne principale du tableau : chaque tour alimente le suivant.
 *
 * Ajouter un tour ici ne suffit pas à faire exister un format. Il faut aussi
 * qu'il figure dans le type énuméré `RoundType` de la base, dans le catalogue
 * `BRACKET_FORMATS` de l'administration, et dans les listes d'affichage des
 * trois écrans qui dessinent un arbre. Les quatre doivent rester d'accord.
 */
export const MAIN_LINE = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];

// L'ordre dans lequel les affiches se déduisent les unes des autres : la petite
// finale a besoin des demies, la finale aussi.
export const RESOLVE_ORDER = [
    'ROUND_OF_32',
    'ROUND_OF_16',
    'QUARTER',
    'SEMI',
    'SMALL_FINAL',
    'FINAL',
    'LEGACY',
];

export const bracketKey = (round, slot) => `${round}:${slot}`;
const key = bracketKey;

/**
 * Les tirages courants, exprimés en rangs de qualification.
 *
 * `standard` oppose le premier au dernier, le deuxième à l'avant-dernier : le
 * tableau classique, qui récompense le classement. `halves` coupe le tableau en
 * deux et apparie les moitiés — 1 contre 5 sur un top 8. `adjacent` oppose les
 * voisins, ce qui n'a rien d'absurde quand le classement amont est indicatif.
 *
 * @param {number} size  le nombre de places du premier tour (8, 16…)
 */
export const SEED_PATTERNS = {
    standard: (size) => Array.from({ length: size / 2 }, (_, i) => [i + 1, size - i]),
    halves: (size) => Array.from({ length: size / 2 }, (_, i) => [i + 1, size / 2 + i + 1]),
    adjacent: (size) => Array.from({ length: size / 2 }, (_, i) => [2 * i + 1, 2 * i + 2]),
};

/**
 * L'affiche d'un slot du premier tour, en rangs de qualification.
 *
 * Sans tirage configuré on retombe sur le classique : c'est le cas le plus
 * fréquent, et l'absence de réglage ne doit rien casser sur les événements
 * existants.
 */
export function firstRoundPair(seedPairs, slot, size) {
    const pair = Array.isArray(seedPairs) ? seedPairs[slot] : null;
    if (Array.isArray(pair)) return [pair[0] ?? null, pair[1] ?? null];
    return [slot + 1, size - slot];
}

/**
 * L'ordre d'entrée d'une catégorie qui n'a AUCUNE phase de qualification.
 *
 * Une Loopstation se joue souvent en tableau direct : pas d'éliminations, les
 * participants entrent sur leur seed d'inscription. Sans cette fonction, rien
 * n'alimentait le premier tour — `seedFromRanking` restait vide, aucune règle
 * de `resolveBracket` ne s'appliquait, et le tableau s'affichait désespérément
 * vide alors que les participants étaient bien là.
 *
 * Deux seeds au minimum : un seul ne compose aucune affiche, et prendre l'ordre
 * d'inscription à défaut produirait un tirage que personne n'a décidé.
 *
 * Les participants sans seed sont écartés plutôt que rangés en fin de liste :
 * un tableau à moitié seedé n'est pas un tableau, et mieux vaut le laisser vide
 * pour que l'organisateur s'en aperçoive.
 */
export function seedFromContenders(contenders = []) {
    const seeded = contenders.filter((c) => Number.isFinite(c?.seed));
    if (seeded.length < 2) return [];
    return [...seeded].sort((a, b) => a.seed - b.seed).map((c) => c.id);
}

/**
 * Une signature canonique d'un jeu de choix. Les clés sont triées ET les champs
 * lus dans un ordre fixe : deux objets identiques construits différemment — le
 * pronostic rechargé depuis la base d'un côté, l'arbre recalculé de l'autre —
 * doivent donner exactement la même chaîne, sinon la comparaison déclare une
 * différence imaginaire et la remontée vers le parent tourne en rond.
 */
export const bracketSignature = (obj) =>
    JSON.stringify(
        Object.keys(obj ?? {})
            .sort()
            .map((k) => {
                const v = obj[k] ?? {};
                return [
                    k,
                    v.contenderAId ?? null,
                    v.contenderBId ?? null,
                    v.winnerId ?? null,
                    v.scoreA ?? null,
                    v.scoreB ?? null,
                ];
            })
    );

export function resolveBracket({
    battlesOf,
    rounds,
    picks,
    seedFromRanking,
    resolvedPhase,
    authoritative,
    // Le tirage du premier tour a-t-il vraiment été publié ? Voir `trustsOfficial`.
    officialDraw = true,
    // Le tirage configuré sur la phase, en rangs. Vide : tableau classique.
    seedPairs = null,
}) {
    const out = new Map();
    const firstMainRound = MAIN_LINE.find((r) => rounds.includes(r));
    const hasSemi = rounds.includes('SEMI');

    /**
     * Une affiche enregistrée en base ne prime sur l'arbre pronostiqué que si
     * elle est réellement officielle :
     *   — la vue organisateur, où la base EST la vérité ;
     *   — le tirage du premier tour, MAIS seulement une fois publié ;
     *   — les affiches Legacy, composées à la main et sans tour amont ;
     *   — une affiche déjà jouée, ou une phase publiée.
     *
     * Le « seulement une fois publié » est essentiel. L'éditeur d'organisateur
     * compose automatiquement les affiches à partir du classement officiel et les
     * enregistre, même en simple brouillon : la base contient donc des
     * appariements de premier tour qui ne sont le tirage de personne. Les prendre
     * pour argent comptant figeait les quarts d'un joueur qui venait pourtant de
     * vider sa qualification — l'arbre gardait huit noms qu'il n'avait jamais
     * choisis.
     *
     * Un tirage ne peut exister qu'une fois la qualification jouée et publiée :
     * c'est ce que porte `officialDraw`, décidé par l'appelant qui, lui, voit la
     * catégorie entière.
     *
     * Sans cette condition, l'affiche d'un tour AVAL enregistrée par
     * l'organisateur écrasait le pronostic : désigner WAALI vainqueur en quart
     * laissait BLACKROLL en demi-finale, parce que la demie « officielle »
     * avait été déduite du vrai résultat et gelait l'arbre du joueur.
     */
    /**
     * Le premier tour est traité à part, y compris en vue organisateur.
     *
     * `authoritative` ne le couvre PAS. Chez l'organisateur, une affiche de tour
     * aval enregistrée est la vérité — elle vient d'un résultat saisi. Mais le
     * premier tour, lui, se DÉDUIT du classement de qualification : c'est tout le
     * principe de l'écran. Le laisser sous l'autorité de la base figeait un
     * appariement déduit d'un classement périmé, et enregistrer un nouveau
     * classement ne changeait plus rien à l'arbre.
     *
     * `officialDraw` porte donc, ici, la question « faut-il s'en tenir à ce qui
     * est enregistré ? ». Vrai chez le joueur quand le tirage est publié ; vrai
     * chez l'organisateur quand aucun classement n'existe pour le déduire — une
     * Loopstation sans phase d'éliminations, dont les affiches sont composées à
     * la main.
     */
    const trustsOfficial = (battle) =>
        battle.round === 'LEGACY' ||
        battle.played ||
        (battle.round === firstMainRound
            ? officialDraw
            : authoritative || resolvedPhase);

    const pairOf = (round, slot) => out.get(key(round, slot)) ?? null;

    for (const round of RESOLVE_ORDER) {
        for (const battle of battlesOf[round] ?? []) {
            let a = null;
            let b = null;

            if ((battle.contenderAId || battle.contenderBId) && trustsOfficial(battle)) {
                // 1. L'organisateur a publié l'affiche : elle fait foi.
                a = battle.contenderAId ?? null;
                b = battle.contenderBId ?? null;
            } else if (round === firstMainRound && seedFromRanking.length) {
                // 2a. Premier tour : on apparie selon le tirage configuré, à défaut
                // 1-8, 2-7, 3-6, 4-5. Les rangs sont donnés à partir de 1 — c'est ce
                // qu'on lit sur un tableau — d'où le décalage à l'indexation.
                const size = (battlesOf[round]?.length ?? 0) * 2;
                const pool = seedFromRanking.slice(0, size);
                const [seedA, seedB] = firstRoundPair(seedPairs, battle.slot, size);
                a = seedA ? pool[seedA - 1] ?? null : null;
                b = seedB ? pool[seedB - 1] ?? null : null;
            } else if (round === 'SMALL_FINAL' && hasSemi) {
                // 2b. Petite finale : les perdants des demies.
                [a, b] = [0, 1].map((slot) => {
                    const semi = pairOf('SEMI', slot);
                    if (!semi?.winnerId) return null;
                    return semi.winnerId === semi.a ? semi.b : semi.a;
                });
            } else if (round === 'SMALL_FINAL' && seedFromRanking.length) {
                // 2c. Format sans demies : les places 3 et 4 du classement.
                a = seedFromRanking[2] ?? null;
                b = seedFromRanking[3] ?? null;
            } else if (round === 'FINAL' && !hasSemi && seedFromRanking.length) {
                a = seedFromRanking[0] ?? null;
                b = seedFromRanking[1] ?? null;
            } else {
                // 2d. Tour suivant : les vainqueurs pronostiqués du tour précédent.
                const prev = MAIN_LINE[MAIN_LINE.indexOf(round) - 1];
                if (prev) {
                    a = pairOf(prev, battle.slot * 2)?.winnerId ?? null;
                    b = pairOf(prev, battle.slot * 2 + 1)?.winnerId ?? null;
                }
            }

            // 3. Le choix enregistré ne survit que s'il porte sur cette affiche.
            const pick = picks[key(round, battle.slot)];
            const stillValid = pick?.winnerId && (pick.winnerId === a || pick.winnerId === b);
            const winnerId = stillValid ? pick.winnerId : null;

            // Le camp qui l'emporte, pour ne garder qu'un score qui le confirme.
            // Changer de vainqueur invalide un score qui disait l'inverse.
            const side = winnerId ? (winnerId === a ? 'a' : 'b') : null;
            const keepScore =
                winnerId && scoreMatchesWinner(pick?.scoreA, pick?.scoreB, side);

            out.set(key(round, battle.slot), {
                round,
                slot: battle.slot,
                a,
                b,
                winnerId,
                side,
                scoreA: keepScore ? pick?.scoreA ?? null : null,
                scoreB: keepScore ? pick?.scoreB ?? null : null,
            });
        }
    }
    return out;
}