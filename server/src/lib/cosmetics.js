/**
 * Le catalogue cosmétique et les badges d'événement.
 *
 * ─── Deux copies, un seul contenu ───────────────────────────────────────────
 *
 * Ce fichier existe en double : `server/src/lib/cosmetics.js` et
 * `web/src/lib/cosmetics.js`. Les deux contextes de build Docker sont séparés,
 * un import qui traverse ne survivrait pas au conteneur. Même règle que
 * `bracket.js`, même piège : les deux copies doivent rester identiques au
 * caractère près.
 *
 * ─── Pourquoi le catalogue vit dans le code ─────────────────────────────────
 *
 * La base ne retient que la POSSESSION (une ligne d'achat) et la TENUE (une
 * colonne par emplacement). Ni le nom, ni le prix, ni le dessin. Ajouter un
 * objet est donc un déploiement, pas une migration, et corriger un prix ne
 * demande pas de toucher aux comptes de qui que ce soit.
 */

/* --------------------------------------------------------------------------
   Les badges
   -------------------------------------------------------------------------- */

/**
 * Les codes sont ceux de l'énumération PostgreSQL et ne bougeront pas :
 * retirer une valeur d'un type énuméré demande de réécrire la colonne. BRONZE,
 * SILVER et GOLD restent donc les identifiants techniques des trois paliers,
 * même si plus personne ne lit ces mots — les libellés affichés parlent de
 * top 60 %, 30 % et 5 %, et vivent dans le dictionnaire.
 */
export const BADGES = [
    { code: 'PODIUM_1', rank: 0, podium: 1 },
    { code: 'PODIUM_2', rank: 1, podium: 2 },
    { code: 'PODIUM_3', rank: 2, podium: 3 },
    { code: 'GOLD', rank: 3, tier: 0.05 },
    { code: 'SILVER', rank: 4, tier: 0.3 },
    { code: 'BRONZE', rank: 5, tier: 0.6 },
    { code: 'PARTICIPANT', rank: 6 },
];

export const badgeByCode = (code) => BADGES.find((b) => b.code === code) ?? null;

/**
 * Le palier atteint par une position donnée, ou null.
 *
 * `Math.ceil` et non `Math.round` : sur vingt participants, le top 5 % doit
 * couvrir la première place et pas zéro. Un arrondi au plus proche donnait un
 * palier vide sur les petites compètes, ce qui est la pire façon de récompenser.
 */
export function tierForPosition(position, total) {
    if (!total || position < 1) return null;
    for (const badge of BADGES) {
        if (!badge.tier) continue;
        if (position <= Math.ceil(total * badge.tier)) return badge.code;
    }
    return null;
}

/* --------------------------------------------------------------------------
   Les emplacements
   -------------------------------------------------------------------------- */

/**
 * Cinq emplacements, cinq colonnes sur User. Un objet par emplacement à la
 * fois, et les emplacements se cumulent librement entre eux.
 *
 * `column` est le nom exact de la colonne Prisma : la route d'équipement s'en
 * sert pour écrire sans avoir à connaître le catalogue.
 */
export const SLOTS = [
    { id: 'frame', column: 'equippedFrame', where: 'avatar' },
    { id: 'nameFx', column: 'equippedNameFx', where: 'pseudo' },
    { id: 'band', column: 'equippedBand', where: 'profil' },
    { id: 'cardSkin', column: 'equippedCardSkin', where: 'export' },
    { id: 'stamp', column: 'equippedStamp', where: 'pronostic' },
];

export const slotById = (id) => SLOTS.find((s) => s.id === id) ?? null;

/* --------------------------------------------------------------------------
   Le catalogue
   -------------------------------------------------------------------------- */

/**
 * Chaque objet porte :
 *   id     — stable, il sert de clé d'achat dans le porte-monnaie. NE JAMAIS
 *            le renommer : une ligne de ledger qui pointe un identifiant mort
 *            devient un achat fantôme.
 *   slot   — l'emplacement.
 *   price  — en points dépensables.
 *   name   — deux langues, dans le code et non dans le dictionnaire : ce sont
 *            des noms de produits, ils changent avec le catalogue et pas avec
 *            la traduction de l'interface.
 *   css    — pour les cadres et les effets de pseudo, la classe à poser.
 *   art    — pour les bandes, la clé dans BAND_ART.
 *   colors — pour les skins de carte : fond, accent, texte. Le canvas d'export
 *            ne sait pas lire une variable CSS, il lui faut des valeurs.
 *   text   — pour les tampons, le libellé imprimé.
 */
export const ITEMS = [
    /* --- Cadres d'avatar --------------------------------------------------- */
    { id: 'frame-filet', slot: 'frame', price: 60, css: 'cos-f-filet',
      name: { en: 'Hairline', fr: 'Filet' } },
    { id: 'frame-rec', slot: 'frame', price: 350, css: 'cos-f-rec', animated: true,
      name: { en: 'Rec button', fr: 'Bouton REC' } },
    { id: 'frame-track', slot: 'frame', price: 400, css: 'cos-f-track', animated: true,
      name: { en: 'Running track', fr: 'Piste qui tourne' } },
    { id: 'frame-clock', slot: 'frame', price: 420, css: 'cos-f-clock', animated: true,
      name: { en: '90 on the clock', fr: 'Chrono 90' } },
    { id: 'frame-countdown', slot: 'frame', price: 420, css: 'cos-f-countdown', animated: true,
      name: { en: 'Countdown', fr: 'Compte à rebours' } },
    { id: 'frame-wave', slot: 'frame', price: 380, css: 'cos-f-wave', animated: true,
      name: { en: 'Wave', fr: 'Onde' } },
    { id: 'frame-helix', slot: 'frame', price: 460, css: 'cos-f-helix', animated: true,
      name: { en: 'Double helix', fr: 'Double hélice' } },
    { id: 'frame-ants', slot: 'frame', price: 280, css: 'cos-f-ants', animated: true,
      name: { en: 'Marching ants', fr: 'Fourmis' } },
    { id: 'frame-vu', slot: 'frame', price: 440, css: 'cos-f-vu', animated: true,
      name: { en: 'VU meter', fr: 'VU-mètre' } },
    { id: 'frame-ovation', slot: 'frame', price: 600, css: 'cos-f-ovation', animated: true,
      name: { en: 'Standing ovation', fr: 'Ovation' } },
    { id: 'frame-cube', slot: 'frame', price: 400, css: 'cos-f-cube',
      name: { en: 'Split cube', fr: 'Cube scindé' } },
    { id: 'frame-tricolore', slot: 'frame', price: 340, css: 'cos-f-tricolore',
      name: { en: 'Tricolour', fr: 'Tricolore' } },
    { id: 'frame-champion', slot: 'frame', price: 900, css: 'cos-f-champion', animated: true,
      name: { en: 'Champion', fr: 'Champion' } },
    { id: 'frame-scan', slot: 'frame', price: 300, css: 'cos-f-scan', animated: true,
      name: { en: 'Scanline', fr: 'Scanline' } },

    /* --- Effets de pseudo -------------------------------------------------- */
    { id: 'fx-underline', slot: 'nameFx', price: 120, css: 'cos-n-underline',
      name: { en: 'Underlined', fr: 'Souligné' } },
    { id: 'fx-chevrons', slot: 'nameFx', price: 180, css: 'cos-n-chevrons',
      name: { en: 'Chevrons', fr: 'Crochets' } },
    { id: 'fx-invert', slot: 'nameFx', price: 280, css: 'cos-n-invert',
      name: { en: 'Reverse video', fr: 'Vidéo inverse' } },
    { id: 'fx-tall', slot: 'nameFx', price: 320, css: 'cos-n-tall',
      name: { en: 'Double height', fr: 'Double hauteur' } },
    { id: 'fx-bullet', slot: 'nameFx', price: 150, css: 'cos-n-bullet',
      name: { en: 'Bullet', fr: 'Puce' } },
    { id: 'fx-spaced', slot: 'nameFx', price: 160, css: 'cos-n-spaced',
      name: { en: 'Letterspaced', fr: 'Espacé' } },

    /* --- Bandes de profil -------------------------------------------------- */
    { id: 'band-faders', slot: 'band', price: 300, art: 'faders',
      name: { en: 'Faders', fr: 'Faders' } },
    { id: 'band-skyline', slot: 'band', price: 340, art: 'skyline',
      name: { en: 'Skyline', fr: 'Gratte-ciel' } },
    { id: 'band-film', slot: 'band', price: 280, art: 'film',
      name: { en: 'Film strip', fr: 'Pellicule' } },
    { id: 'band-cable', slot: 'band', price: 240, art: 'cable',
      name: { en: 'Cable', fr: 'Câble' } },
    { id: 'band-blocks', slot: 'band', price: 320, art: 'blocks',
      name: { en: 'Falling blocks', fr: 'Chute de blocs' } },
    { id: 'band-curtain', slot: 'band', price: 380, art: 'curtain',
      name: { en: 'Stage curtain', fr: 'Rideau de scène' } },
    { id: 'band-vu', slot: 'band', price: 300, art: 'vu',
      name: { en: 'Vertical VU', fr: 'VU vertical' } },
    { id: 'band-flags', slot: 'band', price: 420, art: 'flags',
      name: { en: 'Flag mast', fr: 'Mât de drapeaux' } },
    { id: 'band-tape', slot: 'band', price: 260, art: 'tape',
      name: { en: 'Magnetic tape', fr: 'Bande magnétique' } },
    { id: 'band-cities', slot: 'band', price: 500, art: 'cities',
      name: { en: 'Three cities', fr: 'Trois villes' } },

    /* --- Skins de carte d'export ------------------------------------------ */
    // Vingt points maximum, et c'est délibéré : chaque carte partagée est une
    // affiche pour le site, vue par des gens qui n'ont pas de compte. Autant
    // qu'elles soient variées plutôt que rentables.
    { id: 'skin-teletext', slot: 'cardSkin', price: 0, colors: ['#0b0b0b', '#ff3ce8', '#00e8e8'],
      name: { en: 'Teletext', fr: 'Télétexte' } },
    { id: 'skin-orange', slot: 'cardSkin', price: 20, colors: ['#e8531c', '#ffb08a', '#ffffff'],
      name: { en: 'Contest orange', fr: 'Orange compète' } },
    { id: 'skin-graph', slot: 'cardSkin', price: 20, colors: ['#f2ecd8', '#3a6ea5', '#1a1a1a'],
      name: { en: 'Graph paper', fr: 'Papier millimétré' } },
    { id: 'skin-amber', slot: 'cardSkin', price: 15, colors: ['#0b0b0b', '#ffb000', '#8a5c00'],
      name: { en: 'Amber', fr: 'Ambre' } },
    { id: 'skin-negative', slot: 'cardSkin', price: 15, colors: ['#f4f4f4', '#0b0b0b', '#ff2222'],
      name: { en: 'Negative', fr: 'Négatif' } },
    { id: 'skin-cyan', slot: 'cardSkin', price: 15, colors: ['#04121c', '#00e8e8', '#0a6a80'],
      name: { en: 'Deep cyan', fr: 'Cyan profond' } },
    { id: 'skin-phosphor', slot: 'cardSkin', price: 15, colors: ['#04140a', '#3cff6a', '#0f7a2a'],
      name: { en: 'Phosphor green', fr: 'Vert phosphore' } },
    { id: 'skin-gold', slot: 'cardSkin', price: 20, colors: ['#0b0b0b', '#ffe400', '#8a7a00'],
      name: { en: 'Solid gold', fr: 'Or massif' } },

    /* --- Tampons ----------------------------------------------------------- */
    { id: 'stamp-filed', slot: 'stamp', price: 100, color: 'g',
      text: { en: 'FILED', fr: 'DÉPOSÉ' }, name: { en: 'Filed', fr: 'Déposé' } },
    { id: 'stamp-noregret', slot: 'stamp', price: 220, color: 'm',
      text: { en: 'NO REGRETS', fr: 'SANS REGRET' }, name: { en: 'No regrets', fr: 'Sans regret' } },
    { id: 'stamp-blind', slot: 'stamp', price: 220, color: 'c',
      text: { en: 'EYES CLOSED', fr: 'YEUX FERMÉS' }, name: { en: 'Eyes closed', fr: 'Les yeux fermés' } },
    { id: 'stamp-rethink', slot: 'stamp', price: 160, color: 'r',
      text: { en: 'NEEDS WORK', fr: 'À REVOIR' }, name: { en: 'Needs work', fr: 'À revoir' } },
    { id: 'stamp-bet', slot: 'stamp', price: 320, color: 'y',
      text: { en: 'BET OF THE YEAR', fr: "PARI DE L'ANNÉE" }, name: { en: 'Bet of the year', fr: "Pari de l'année" } },
    { id: 'stamp-turning', slot: 'stamp', price: 280, color: 'o',
      text: { en: 'IT TURNS HERE', fr: 'ICI ÇA BASCULE' }, name: { en: 'It turns here', fr: 'Ici ça bascule' } },
    { id: 'stamp-favourite', slot: 'stamp', price: 200, color: 'm',
      text: { en: 'MY PICK', fr: 'MON CHOUCHOU' }, name: { en: 'My pick', fr: 'Mon chouchou' } },
    { id: 'stamp-confirmed', slot: 'stamp', price: 400, color: 'y', requiresBadge: 'PODIUM_1',
      text: { en: 'CONFIRMED 5-0', fr: 'CONFIRMÉ 5-0' }, name: { en: 'Confirmed', fr: 'Confirmé' } },
    { id: 'stamp-first', slot: 'stamp', price: 0, color: 'w',
      text: { en: 'FIRST TIME', fr: 'PREMIÈRE FOIS' }, name: { en: 'First time', fr: 'Première fois' } },
    { id: 'stamp-tv', slot: 'stamp', price: 240, color: 'c',
      text: { en: 'AS SEEN ON TV', fr: 'VU À LA TÉLÉ' }, name: { en: 'As seen on TV', fr: 'Vu à la télé' } },
];

export const itemById = (id) => (id ? ITEMS.find((i) => i.id === id) ?? null : null);
export const itemsForSlot = (slot) => ITEMS.filter((i) => i.slot === slot);

/** Les identifiants vivants, pour la migration et pour le nettoyage. */
export const ALL_IDS = ITEMS.map((i) => i.id);