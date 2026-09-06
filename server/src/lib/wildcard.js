/**
 * Les catégories de wildcards.
 *
 * ─── Ce que c'est ───────────────────────────────────────────────────────────
 *
 * Une compétition entière qui tient en une question : parmi les artistes
 * inscrits, lesquels passeront la sélection sur vidéo ? Pas de tableau, pas
 * d'affiches — une liste de participants, un nombre de places, et un classement
 * à pronostiquer.
 *
 * ─── Pourquoi ce n'est PAS une valeur d'énumération ─────────────────────────
 *
 * On aurait pu ajouter WILDCARD_SOLO, WILDCARD_CREW et les autres à
 * `CategoryKind`. Deux raisons de ne pas le faire, et la première suffit.
 *
 * Le `kind` d'une catégorie sert à filtrer les artistes qu'on peut y engager :
 * l'écran ne propose que ceux typés dans ce format. Un kind « WILDCARD_SOLO »
 * ne correspondrait à aucun artiste, et le sélecteur de participants serait
 * vide — il faudrait alors typer tous les artistes une deuxième fois.
 *
 * Ensuite, retirer une valeur d'un type énuméré PostgreSQL demande de réécrire
 * la colonne et ses index. Six valeurs de plus, c'est six décisions
 * irréversibles pour une distinction que la STRUCTURE dit déjà.
 *
 * Une catégorie de wildcards est donc une catégorie ordinaire — Solo, Crew,
 * Loopstation — dont la structure se résume à une seule phase de qualification.
 * Le nom porte la nuance (« Wildcard Solo Femme »), la forme porte la règle.
 *
 * ─── Deux copies ────────────────────────────────────────────────────────────
 *
 * Ce fichier existe en double, `server/src/lib/` et `web/src/lib/`. Les deux
 * contextes de build Docker sont séparés. Même règle que `bracket.js` et
 * `cosmetics.js`, même piège : les deux copies doivent rester identiques.
 */

/**
 * Cette catégorie est-elle une compétition de wildcards ?
 *
 * Une seule phase, et c'est une phase de classement. Le test porte sur la
 * structure plutôt que sur un drapeau enregistré : un drapeau peut mentir après
 * qu'on a retouché le format, la structure non.
 */
export function isWildcardCategory(category) {
    const phases = category?.phases ?? [];
    return phases.length === 1 && phases[0].type === 'WILDCARD';
}

/**
 * Les entrées proposées à la composition d'un événement.
 *
 * `kind` est la discipline réelle — c'est elle qui décide quels artistes on
 * peut engager. `label` est le nom donné à la catégorie, et il porte à lui seul
 * la nuance que le kind ne sait pas exprimer : mixte, féminine.
 */
export const WILDCARD_KINDS = [
    { id: 'WC_SOLO', kind: 'SOLO', label: 'Wildcard Solo' },
    { id: 'WC_SOLO_MIXED', kind: 'SOLO', label: 'Wildcard Solo Mixte' },
    { id: 'WC_SOLO_WOMEN', kind: 'SOLO', label: 'Wildcard Solo Femme' },
    { id: 'WC_TAG_TEAM', kind: 'TAG_TEAM', label: 'Wildcard Tag Team' },
    { id: 'WC_LOOPSTATION', kind: 'LOOPSTATION', label: 'Wildcard Loopstation' },
    { id: 'WC_CREW', kind: 'CREW', label: 'Wildcard Crew' },
];

/** Le nombre de places d'une sélection. Un artiste au minimum, cent au plus. */
export const MIN_PLACES = 1;
export const MAX_PLACES = 100;

export const clampPlaces = (n) =>
    Math.min(MAX_PLACES, Math.max(MIN_PLACES, Number.isFinite(n) ? Math.round(n) : MIN_PLACES));