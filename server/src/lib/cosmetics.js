/**
 * Le catalogue cosmétique — badges et boutique.
 *
 * Dans le code et non en base, comme la couleur d'un groupe se déduit de son
 * slug : un objet de boutique n'a aucun état propre. La base ne retient que
 * qui possède quoi (WalletEntry) et qui porte quoi (User.equipped*). Ajouter
 * un objet = ajouter une entrée ici et déployer — pas de panneau d'admin, pas
 * de migration.
 *
 * ⚠ Ce fichier existe en DEUX exemplaires, comme bracket.js :
 *     server/src/lib/cosmetics.js   et   web/src/lib/cosmetics.js
 *   Les deux contextes de build Docker ne partagent rien. Toute modification
 *   se fait dans les deux, à l'identique.
 *
 * Les couleurs sont des RÔLES du système P411 (y, c, g, m, r, w, b), jamais
 * des codes hexadécimaux : le client les traduit en variables CSS. Ce fichier
 * ne connaît ni React ni Prisma — il doit rester importable des deux côtés.
 */

// --- Badges --------------------------------------------------------------------
//
// Jamais achetables : ils se gagnent, c'est ce qui fait leur valeur. L'ordre
// est celui de l'affichage sur un profil (du plus prestigieux au plus commun).

export const BADGES = [
    // Fond bleu : le seul fond de bloc que le système autorise — réservé au
    // vainqueur, personne d'autre n'y a droit.
    { code: 'PODIUM_1', color: 'y', kind: 'podium', rank: 1 },
    { code: 'PODIUM_2', color: 'c', kind: 'podium', rank: 2 },
    { code: 'PODIUM_3', color: 'g', kind: 'podium', rank: 3 },
    // Les paliers : un, deux, trois chevrons. Pas d'or ni d'argent dans un
    // télétexte — le nombre de chevrons dit le rang, la couleur suit les rôles.
    { code: 'GOLD', color: 'y', kind: 'tier', chevrons: 3, cut: 0.05 },
    { code: 'SILVER', color: 'c', kind: 'tier', chevrons: 2, cut: 0.3 },
    { code: 'BRONZE', color: 'm', kind: 'tier', chevrons: 1, cut: 0.6 },
    { code: 'PARTICIPANT', color: 'w', kind: 'ticket' },
];

export const badgeByCode = (code) => BADGES.find((b) => b.code === code) ?? null;

/**
 * Le palier atteint pour une place donnée sur N classés — le plus haut
 * seulement : un Gold n'empile pas Silver et Bronze, la collection se lit
 * compète par compète.
 *
 * `ceil` et non `floor` : sur un petit plateau, la première place doit
 * toujours valoir Gold — ceil(3 × 0.05) = 1, là où floor donnerait zéro
 * éligible et une compète sans or.
 */
export function tierForPosition(position, total) {
    if (total <= 0) return null;
    if (position <= Math.ceil(total * 0.05)) return 'GOLD';
    if (position <= Math.ceil(total * 0.3)) return 'SILVER';
    if (position <= Math.ceil(total * 0.6)) return 'BRONZE';
    return null;
}

// --- Boutique ------------------------------------------------------------------
//
// Trois emplacements, trois colonnes sur User. Un objet appartient à un seul
// emplacement : porter un cadre ne prive jamais d'un titre.

export const SLOTS = ['frame', 'title', 'flair'];

// Les prix se règlent ici et nulle part ailleurs. Ordre de grandeur retenu :
// un bon pronostiqueur gagne son premier pin sur une compète, un cadre en
// demande deux ou trois — à ajuster quand la vraie économie parlera.
export const SHOP_ITEMS = [
    // --- Cadres : autour de l'avatar, partout où il s'affiche ---
    {
        id: 'frame-three-oh',
        slot: 'frame',
        price: 300,
        color: 'g',
        name: { en: '3-0 Frame', fr: 'Cadre 3-0' },
        blurb: { en: 'A clean sweep around your avatar.', fr: 'Une victoire nette autour de votre avatar.' },
    },
    {
        id: 'frame-wildcard',
        slot: 'frame',
        price: 150,
        color: 'c',
        name: { en: 'Wildcard Frame', fr: 'Cadre Wildcard' },
        blurb: { en: 'You came in through the side door.', fr: 'Entré par la petite porte.' },
    },
    {
        id: 'frame-world-stage',
        slot: 'frame',
        price: 500,
        color: 'y',
        name: { en: 'World Stage', fr: 'Scène mondiale' },
        blurb: { en: 'Double gold rail, grand battle energy.', fr: 'Double filet or, ambiance grande finale mondiale.' },
    },
    {
        id: 'frame-tricolore',
        slot: 'frame',
        price: 400,
        color: 'b',
        name: { en: 'Tricolore', fr: 'Tricolore' },
        blurb: { en: 'For the national championship faithful.', fr: 'Pour les fidèles du Championnat de France.' },
    },
    {
        id: 'frame-cypher',
        slot: 'frame',
        price: 250,
        color: 'm',
        name: { en: 'Cypher Frame', fr: 'Cadre Cypher' },
        blurb: { en: 'The circle forms around you.', fr: 'Le cercle se forme autour de vous.' },
    },

    // --- Titres : la ligne magenta sous le pseudo ---
    {
        id: 'title-fifth-judge',
        slot: 'title',
        price: 250,
        color: 'm',
        name: { en: 'The 5th Judge', fr: 'Le 5e juge' },
        blurb: { en: 'Your scorecard matters too.', fr: 'Votre carnet de notes compte aussi.' },
    },
    {
        id: 'title-bracket-oracle',
        slot: 'title',
        price: 200,
        color: 'm',
        name: { en: 'Bracket Oracle', fr: 'Oracle du bracket' },
        blurb: { en: 'Sees the final before the draw.', fr: 'Voit la finale avant le tirage.' },
    },
    {
        id: 'title-mister-three-oh',
        slot: 'title',
        price: 300,
        color: 'm',
        name: { en: 'Mister 3-0', fr: 'Mister 3-0' },
        blurb: { en: 'Never needs a deliberation.', fr: 'Jamais besoin de délibération.' },
    },
    {
        id: 'title-wildcard-hunter',
        slot: 'title',
        price: 150,
        color: 'm',
        name: { en: 'Wildcard Hunter', fr: 'Chasseur de wildcards' },
        blurb: { en: 'Watches every submission in October.', fr: 'Regarde toutes les vidéos dès octobre.' },
    },
    {
        id: 'title-crowd-favorite',
        slot: 'title',
        price: 100,
        color: 'm',
        name: { en: 'Crowd Favorite', fr: 'Chouchou du public' },
        blurb: { en: 'The room is on your side.', fr: 'La salle est de votre côté.' },
    },

    // --- Pins : la petite icône à côté du nom ---
    {
        id: 'flair-mic',
        slot: 'flair',
        price: 100,
        color: 'w',
        icon: 'mic',
        name: { en: 'The Mic', fr: 'Le micro' },
        blurb: { en: 'Check, one two.', fr: 'Check, un deux.' },
    },
    {
        id: 'flair-cap',
        slot: 'flair',
        price: 200,
        color: 'r',
        icon: 'cap',
        name: { en: 'The Cap', fr: 'La casquette' },
        blurb: { en: 'A certain champion never takes his off.', fr: 'Un certain champion ne quitte jamais la sienne.' },
    },
    {
        id: 'flair-loop',
        slot: 'flair',
        price: 150,
        color: 'c',
        icon: 'loop',
        name: { en: 'The Pedal', fr: 'La pédale' },
        blurb: { en: 'Layer by layer.', fr: 'Couche par couche.' },
    },
    {
        id: 'flair-hex',
        slot: 'flair',
        price: 150,
        color: 'b',
        icon: 'hex',
        name: { en: 'The Hexagon', fr: "L'Hexagone" },
        blurb: { en: 'French scene, worldwide sound.', fr: 'Scène française, son mondial.' },
    },
    {
        id: 'flair-globe',
        slot: 'flair',
        price: 200,
        color: 'g',
        icon: 'globe',
        name: { en: 'The Globe', fr: 'Le globe' },
        blurb: { en: 'Wherever the grand battle lands.', fr: 'Là où la grande battle se pose.' },
    },
    {
        id: 'flair-crown',
        slot: 'flair',
        price: 400,
        color: 'y',
        icon: 'crown',
        name: { en: 'The Crown', fr: 'La couronne' },
        blurb: { en: 'Heavy is the head.', fr: 'Lourde est la tête.' },
    },
];

export const itemById = (id) => SHOP_ITEMS.find((i) => i.id === id) ?? null;