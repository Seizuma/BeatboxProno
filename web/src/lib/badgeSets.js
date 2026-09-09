import * as gbb from './badgeSprites.js';

/**
 * Les familles de badges.
 *
 * ─── Pourquoi un registre ───────────────────────────────────────────────────
 *
 * Il n'existait qu'un seul jeu de dessins, et il était donc implicite : le
 * composant importait directement le module engendré, et toute compète décernant
 * un palmarès affichait forcément les mêmes cubes. Une sélection de wildcards à
 * vingt joueurs décernait les médailles du Grand Beatbox Battle.
 *
 * L'événement désigne maintenant une famille par son identifiant, et ce fichier
 * dit ce que cet identifiant recouvre. C'est la seule chose à toucher pour en
 * ajouter une : le serveur ne connaît pas ce catalogue, il n'enregistre que le
 * code du badge.
 *
 * ─── Ajouter une famille ────────────────────────────────────────────────────
 *
 * 1. Dans `tools/gen-badges.mjs`, changer `SET` et le nom du fichier produit,
 *    puis lancer le générateur EN LOCAL — jamais dans Docker, jamais sur le
 *    VPS : il dessine, ce qui demande des dépendances que l'image n'a pas.
 * 2. Importer le module ici et l'ajouter à `SETS`.
 * 3. La famille devient sélectionnable dans les réglages de l'événement.
 *
 * Les classes CSS sont préfixées par l'identifiant de famille (`cos-badge3d--
 * gbb-GOLD`), sans quoi deux familles se marcheraient dessus : le même code de
 * badge existe dans chacune.
 */
export const SETS = {
    gbb: {
        id: 'gbb',
        // Le libellé du sélecteur d'administration. Volontairement en clair
        // plutôt qu'une clé de traduction : ce nom désigne un jeu de dessins,
        // pas une phrase d'interface, et il ne se traduit pas.
        label: 'Grand Beatbox Battle',
        module: gbb,
    },
};

export const setById = (id) => (id ? SETS[id] ?? null : null);

/**
 * La famille montrée quand un badge est présenté comme une RÈGLE.
 *
 * La boutique explique ce que vaut chaque médaille sans parler d'aucune
 * compète : il n'y a alors pas de famille à déduire, et le badge s'afficherait
 * vide. On retombe sur la première du catalogue.
 */
export const DEFAULT_SET = 'gbb';

/** Les familles proposées à l'organisateur, dans l'ordre du catalogue. */
export const SET_LIST = Object.values(SETS);

/**
 * Pose les feuilles de styles de TOUTES les familles, une fois.
 *
 * Toutes et pas seulement celle en cours : un profil affiche le palmarès de
 * plusieurs compètes à la fois, qui peuvent relever de familles différentes.
 * Charger à la demande obligerait à réinstaller une feuille en cours de rendu,
 * pour un gain nul — les dessins sont déjà dans le paquet.
 */
export function installBadgeSets() {
    for (const set of SET_LIST) set.module.installBadges();
}

/**
 * Le code est-il dessiné dans cette famille ?
 *
 * Une famille peut très bien n'en couvrir qu'une partie — rien n'oblige une
 * compète mineure à dessiner trois places de podium. Le mur saute alors le
 * badge au lieu d'afficher une case vide.
 */
export function hasBadge(setId, code) {
    const set = setById(setId);
    return Boolean(set && set.module.BADGE_CODES.includes(code));
}