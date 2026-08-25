/**
 * Un score est-il cohérent avec le camp désigné vainqueur ?
 *
 * Définie ICI plutôt qu'importée de `scores.js`, et c'est délibéré : ce fichier
 * existe en deux exemplaires — serveur et client — parce que les deux
 * construisent des images Docker séparées. `scores.js` n'a de sens que côté
 * client, l'importer rendait les deux copies impossibles à garder identiques.
 *
 * « Sans avis » reste valide : un score absent n'est pas une contradiction,
 * c'est une abstention.
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
 * qu'il figure dans `RoundType` en base, dans `BRACKET_FORMATS` et le schéma des
 * affiches de `routes/admin.js`, dans celui du dépôt de `routes/predictions.js`,
 * et dans les listes d'affichage des écrans qui dessinent un arbre.
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
/**
 * L'ordre des rangs dans un tableau classique.
 *
 * ─── La règle ────────────────────────────────────────────────────────────────
 *
 * À chaque doublement de taille, chaque rang déjà placé s'apparie à son
 * complément : [1] devient [1, 2], qui devient [1, 4, 2, 3], puis
 * [1, 8, 4, 5, 2, 7, 3, 6]. C'est ce qui garantit la propriété qu'on attend
 * d'un tableau — le premier et le deuxième ne peuvent se rencontrer qu'en
 * finale, le premier et le troisième pas avant les demies, et ainsi de suite.
 *
 * ─── Ce que faisait la version précédente ────────────────────────────────────
 *
 * Elle produisait (1,8) (2,7) (3,6) (4,5), c'est-à-dire les rangs pris deux à
 * deux depuis les extrémités. Le premier affrontement était juste, mais la
 * suite ne l'était pas : les têtes de série 1 et 2 se retrouvaient dans la même
 * moitié et se seraient croisées en demi-finale. Ce n'est pas un tableau
 * classique, c'est un appariement symétrique — ce qui n'est pas la même chose.
 *
 * Le motif « moitiés » ci-dessous, lui, est bien un appariement délibéré : il
 * oppose la première moitié du classement à la seconde, ce que GBB a déjà fait.
 */
function classicOrder(size) {
    let order = [1];
    for (let n = 2; n <= size; n *= 2) {
        const next = [];
        for (const seed of order) {
            next.push(seed);
            next.push(n + 1 - seed);
        }
        order = next;
    }
    return order;
}

export const SEED_PATTERNS = {
    standard: (size) => {
        const order = classicOrder(size);
        return Array.from({ length: size / 2 }, (_, i) => [order[2 * i], order[2 * i + 1]]);
    },
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

    // Le repli suit le motif classique, comme le préréglage du même nom : sans
    // cela, « aucun tirage configuré » et « tirage classique » donneraient deux
    // tableaux différents, ce qui est indéfendable.
    const fallback = SEED_PATTERNS.standard(size)[slot];
    return fallback ? [fallback[0] ?? null, fallback[1] ?? null] : [null, null];
}

/**
 * L'ordre d'entrée d'une catégorie qui n'a AUCUNE phase de qualification.
 *
 * Une Loopstation se joue souvent en tableau direct : pas d'éliminations, les
 * participants entrent sur leur seed d'inscription. Sans cette fonction, rien
 * n'alimentait le premier tour et le tableau s'affichait vide alors que les
 * participants étaient bien là.
 *
 * Deux seeds au minimum, et les participants sans seed sont écartés plutôt que
 * rangés en fin de liste : un tableau à moitié seedé n'est pas un tableau, et
 * mieux vaut le laisser vide pour que l'organisateur s'en aperçoive.
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

    /**
     * L'appariement d'un tour qui DÉCOULE d'un tour amont du même arbre.
     *
     * Renvoie `null` quand le tour ne découle de rien : premier tour, affiche
     * Legacy composée à la main, ou format où le tour amont n'existe pas.
     *
     * ─── Pourquoi cette déduction PRIME sur ce qui est enregistré ────────────
     *
     * Une demi-finale n'est pas une donnée : c'est une conséquence. Tant qu'elle
     * était traitée comme une donnée, la ligne enregistrée survivait à la
     * correction du quart qui l'alimente — l'organisateur désignait LENNARD
     * vainqueur de son quart et la demie gardait MAHIRO, indéfiniment, parce que
     * `trustsOfficial` la déclarait officielle. Le tableau publié devenait
     * incohérent avec lui-même : un joueur ayant tout deviné juste perdait les
     * points de la demie ET de la petite finale, sans que rien ne le signale.
     *
     * Un nom déduit ne s'efface toutefois JAMAIS un nom enregistré : la
     * déduction se fait côté par côté, et un amont encore sans vainqueur laisse
     * la place à ce qui était là. C'est ce qui permet de saisir une demie avant
     * son quart sans la voir se vider.
     */
    const derivedPair = (round, slot) => {
        if (round === 'SMALL_FINAL' && hasSemi) {
            // La petite finale : les perdants des demies.
            return [0, 1].map((semiSlot) => {
                const semi = pairOf('SEMI', semiSlot);
                if (!semi?.winnerId) return null;
                return semi.winnerId === semi.a ? semi.b : semi.a;
            });
        }

        const index = MAIN_LINE.indexOf(round);
        if (index < 1) return null; // premier tour, SMALL_FINAL sans demies, LEGACY
        const prev = MAIN_LINE[index - 1];
        // Un tour amont absent du format — une finale directe, par exemple — ne
        // déduit rien : on s'en remet à ce qui est enregistré.
        if (!prev || !rounds.includes(prev)) return null;

        return [
            pairOf(prev, slot * 2)?.winnerId ?? null,
            pairOf(prev, slot * 2 + 1)?.winnerId ?? null,
        ];
    };

    for (const round of RESOLVE_ORDER) {
        for (const battle of battlesOf[round] ?? []) {
            let a = null;
            let b = null;

            // L'affiche enregistrée, quand elle fait foi. Elle sert de socle : la
            // déduction ne la remplace que là où elle a quelque chose à dire.
            const stored =
                (battle.contenderAId || battle.contenderBId) && trustsOfficial(battle)
                    ? [battle.contenderAId ?? null, battle.contenderBId ?? null]
                    : null;

            const derived = derivedPair(round, battle.slot);

            if (derived) {
                // 1. Tour déduit de l'amont : l'arbre commande, côté par côté.
                a = derived[0] ?? stored?.[0] ?? null;
                b = derived[1] ?? stored?.[1] ?? null;
            } else if (stored) {
                // 2. Rien à déduire, et l'affiche est officielle : elle fait foi.
                [a, b] = stored;
            } else if (round === firstMainRound && seedFromRanking.length) {
                // 3a. Premier tour : on apparie selon le tirage configuré, à défaut
                // 1-8, 2-7, 3-6, 4-5. Les rangs sont donnés à partir de 1 — c'est ce
                // qu'on lit sur un tableau — d'où le décalage à l'indexation.
                const size = (battlesOf[round]?.length ?? 0) * 2;
                const pool = seedFromRanking.slice(0, size);
                const [seedA, seedB] = firstRoundPair(seedPairs, battle.slot, size);
                a = seedA ? pool[seedA - 1] ?? null : null;
                b = seedB ? pool[seedB - 1] ?? null : null;
            } else if (round === 'SMALL_FINAL' && seedFromRanking.length) {
                // 3b. Format sans demies : les places 3 et 4 du classement.
                a = seedFromRanking[2] ?? null;
                b = seedFromRanking[3] ?? null;
            } else if (round === 'FINAL' && !hasSemi && seedFromRanking.length) {
                a = seedFromRanking[0] ?? null;
                b = seedFromRanking[1] ?? null;
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