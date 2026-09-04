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
 *   colors — pour les skins de carte : [fond, accent, encre], et RIEN d'autre.
 *            Les nuances intermédiaires se déduisent par mélange dans
 *            `predictionCard.js` : sept teintes à choisir par skin, personne ne
 *            les choisirait bien. `null` signifie « garder la palette du site ».
 *   text   — pour les tampons, le libellé imprimé.
 */
export const ITEMS = [
    /* --- Cadres d'avatar ---------------------------------------------------
       Le dessin ne vit PAS ici mais dans `frames.js`, sous le même identifiant
       privé du préfixe `frame-`. Ce fichier ne retient que ce qui se vend : un
       nom, un prix, et le fait que ça bouge ou non.

       `css` reste la classe posée par FramedAvatar. Elle est engendrée avec la
       feuille, donc il n'y a rien à tenir d'accord à la main. */
    // Gratuit, et c'est le seul cadre à l'être : il faut un objet qu'on porte
    // sans avoir rien gagné, sinon un compte neuf n'a aucune raison d'ouvrir la
    // boutique. Le filet est le bon candidat — un trait d'un pixel, il habille
    // sans rien promettre, et il ne dévalue aucun des payants.
    { id: 'frame-filet', slot: 'frame', price: 0, css: 'cos-f-filet',
      name: { en: 'Hairline', fr: 'Filet' } },
    { id: 'frame-equerres', slot: 'frame', price: 25, css: 'cos-f-equerres',
      name: { en: 'Corner brackets', fr: 'Équerres' } },
    { id: 'frame-grille', slot: 'frame', price: 45, css: 'cos-f-grille',
      name: { en: 'Mic grille', fr: 'Grille de micro' } },
    // L'identifiant reste « pellicule » alors que le nom change : le changer
    // ferait perdre l'objet à ceux qui l'ont acheté, pour une décision d'affichage.
    { id: 'frame-pellicule', slot: 'frame', price: 50, css: 'cos-f-pellicule',
      name: { en: 'Processor', fr: 'Processeur' } },
    { id: 'frame-chevrons', slot: 'frame', price: 55, css: 'cos-f-chevrons',
      name: { en: 'Chevrons', fr: 'Chevrons' } },
    { id: 'frame-double', slot: 'frame', price: 30, css: 'cos-f-double',
      name: { en: 'Double rule', fr: 'Double filet' } },
    { id: 'frame-ruban', slot: 'frame', price: 50, css: 'cos-f-ruban',
      name: { en: 'Torn tape', fr: 'Ruban' } },
    { id: 'frame-cube', slot: 'frame', price: 75, css: 'cos-f-cube',
      name: { en: 'Cube shards', fr: 'Éclats de cube' } },
    { id: 'frame-tricolore', slot: 'frame', price: 60, css: 'cos-f-tricolore',
      name: { en: 'Tricolour', fr: 'Tricolore' } },
    { id: 'frame-cypher', slot: 'frame', price: 55, css: 'cos-f-cypher',
      name: { en: 'Cypher', fr: 'Cypher' } },
    { id: 'frame-coeurs', slot: 'frame', price: 55, css: 'cos-f-coeurs',
      name: { en: 'Hearts', fr: 'Cœurs' } },
    { id: 'frame-fleurs', slot: 'frame', price: 55, css: 'cos-f-fleurs',
      name: { en: 'Flowers', fr: 'Fleurs' } },
    { id: 'frame-cabine', slot: 'frame', price: 60, css: 'cos-f-cabine',
      name: { en: 'Booth', fr: 'Cabine' } },

    // Par crans : de l'animation image par image, dessinée.
    { id: 'frame-course', slot: 'frame', price: 130, css: 'cos-f-course', animated: true,
      name: { en: 'Running light', fr: 'Lampe qui court' } },
    { id: 'frame-rgb', slot: 'frame', price: 110, css: 'cos-f-rgb', animated: true,
      name: { en: 'RGB', fr: 'RGB' } },
    { id: 'frame-rec', slot: 'frame', price: 100, css: 'cos-f-rec', animated: true,
      name: { en: 'Rec light', fr: 'Voyant REC' } },

    // Fluides : deux dessins qui se fondent, ou une respiration.
    { id: 'frame-braise', slot: 'frame', price: 130, css: 'cos-f-braise', animated: true,
      name: { en: 'Embers', fr: 'Braise' } },
    { id: 'frame-relais', slot: 'frame', price: 150, css: 'cos-f-relais', animated: true,
      name: { en: 'Relay', fr: 'Relais' } },
    { id: 'frame-souffle', slot: 'frame', price: 90, css: 'cos-f-souffle', animated: true,
      name: { en: 'Breath', fr: 'Souffle' } },

    /* --- Effets de pseudo -------------------------------------------------- */
    { id: 'fx-underline', slot: 'nameFx', price: 20, css: 'cos-n-underline',
      name: { en: 'Underlined', fr: 'Souligné' } },
    { id: 'fx-chevrons', slot: 'nameFx', price: 35, css: 'cos-n-chevrons',
      name: { en: 'Chevrons', fr: 'Crochets' } },
    { id: 'fx-invert', slot: 'nameFx', price: 50, css: 'cos-n-invert',
      name: { en: 'Reverse video', fr: 'Vidéo inverse' } },
    { id: 'fx-tall', slot: 'nameFx', price: 60, css: 'cos-n-tall',
      name: { en: 'Double height', fr: 'Double hauteur' } },
    { id: 'fx-bullet', slot: 'nameFx', price: 25, css: 'cos-n-bullet',
      name: { en: 'Bullet', fr: 'Puce' } },
    { id: 'fx-spaced', slot: 'nameFx', price: 30, css: 'cos-n-spaced',
      name: { en: 'Letterspaced', fr: 'Espacé' } },

    /* --- Bandes de profil -------------------------------------------------- */
    // L'identifiant ne bouge pas : c'est une refonte du dessin, pas un nouvel
    // objet. Ceux qui l'ont acheté le gardent, et le voient changer d'allure.
    { id: 'band-faders', slot: 'band', price: 60, art: 'vines',
      name: { en: 'Vines', fr: 'Lianes' } },
    { id: 'band-film', slot: 'band', price: 55, art: 'film',
      name: { en: 'Film strip', fr: 'Pellicule' } },
    { id: 'band-cable', slot: 'band', price: 45, art: 'cable',
      name: { en: 'Cable', fr: 'Câble' } },
    { id: 'band-blocks', slot: 'band', price: 65, art: 'blocks',
      name: { en: 'Falling blocks', fr: 'Chute de blocs' } },
    { id: 'band-missing', slot: 'band', price: 70, art: 'missing',
      name: { en: 'Missing texture', fr: 'Texture manquante' } },
    { id: 'band-curtain', slot: 'band', price: 80, art: 'curtain',
      name: { en: 'Stage curtain', fr: 'Rideau de scène' } },
    { id: 'band-vu', slot: 'band', price: 60, art: 'vu',
      name: { en: 'Vertical VU', fr: 'VU vertical' } },
    { id: 'band-flags', slot: 'band', price: 90, art: 'flags',
      name: { en: 'Flag mast', fr: 'Mât de drapeaux' } },

    /* --- Skins de carte d'export ------------------------------------------ */
    // Vingt points maximum, et c'est délibéré : chaque carte partagée est une
    // affiche pour le site, vue par des gens qui n'ont pas de compte. Autant
    // qu'elles soient variées plutôt que rentables.
    { id: 'skin-teletext', slot: 'cardSkin', price: 0, colors: null,
      name: { en: 'Teletext', fr: 'Télétexte' } },
    { id: 'skin-orange', slot: 'cardSkin', price: 20, colors: ['#e8531c', '#ffd66b', '#2a0d02'],
      name: { en: 'Contest orange', fr: 'Orange compète' } },
    { id: 'skin-graph', slot: 'cardSkin', price: 20, colors: ['#f2ecd8', '#2f5fa0', '#1a1a1a'],
      name: { en: 'Graph paper', fr: 'Papier millimétré' } },
    { id: 'skin-amber', slot: 'cardSkin', price: 15, colors: ['#0b0b0b', '#ffb000', '#ffd48a'],
      name: { en: 'Amber', fr: 'Ambre' } },
    { id: 'skin-negative', slot: 'cardSkin', price: 15, colors: ['#f4f4f4', '#c81414', '#141414'],
      name: { en: 'Negative', fr: 'Négatif' } },
    { id: 'skin-cyan', slot: 'cardSkin', price: 15, colors: ['#04121c', '#00e8e8', '#bfe9f2'],
      name: { en: 'Deep cyan', fr: 'Cyan profond' } },
    { id: 'skin-phosphor', slot: 'cardSkin', price: 15, colors: ['#04140a', '#3cff6a', '#a8f5bd'],
      name: { en: 'Phosphor green', fr: 'Vert phosphore' } },
    { id: 'skin-gold', slot: 'cardSkin', price: 25, colors: ['#0b0b0b', '#ffe400', '#e0cf7a'],
      name: { en: 'Solid gold', fr: 'Or massif' } },

    /* --- Tampons ----------------------------------------------------------- */
    { id: 'stamp-filed', slot: 'stamp', price: 20, color: 'g',
      text: { en: 'FILED', fr: 'DÉPOSÉ' }, name: { en: 'Filed', fr: 'Déposé' } },
    { id: 'stamp-noregret', slot: 'stamp', price: 40, color: 'r',
      text: { en: 'NO REGRETS', fr: 'SANS REGRET' }, name: { en: 'No regrets', fr: 'Sans regret' } },
    { id: 'stamp-blind', slot: 'stamp', price: 40, color: 'o',
      text: { en: 'EYES CLOSED', fr: 'YEUX FERMÉS' }, name: { en: 'Eyes closed', fr: 'Les yeux fermés' } },
    { id: 'stamp-bet', slot: 'stamp', price: 60, color: 'y',
      text: { en: 'BET OF THE YEAR', fr: "PARI DE L'ANNÉE" }, name: { en: 'Bet of the year', fr: "Pari de l'année" } },
    // « Écoutez-moi » : le tampon de celui qui sait que son pronostic surprend
    // et qui l'assume. C'est le seul du catalogue qui s'adresse au lecteur.
    { id: 'stamp-hearmeout', slot: 'stamp', price: 40, color: 'c',
      text: { en: 'HEAR ME OUT', fr: 'HEAR ME OUT' }, name: { en: 'Hear me out', fr: 'Hear me out' } },
    // Trois points d'interrogation, dans les deux langues : il n'y a rien à
    // traduire, et c'est précisément ce qui le rend drôle.
    { id: 'stamp-what', slot: 'stamp', price: 30, color: 'w',
      text: { en: '???', fr: '???' }, name: { en: '???', fr: '???' } },
    { id: 'stamp-confirmed', slot: 'stamp', price: 75, color: 'm', requiresBadge: 'PODIUM_1',
      text: { en: 'CONFIRMED 5-0', fr: 'CONFIRMÉ 5-0' }, name: { en: 'Confirmed', fr: 'Confirmé' } },
];

/* --------------------------------------------------------------------------
   Les promotions
   -------------------------------------------------------------------------- */

/**
 * Le prix après remise.
 *
 * Vit ICI, dans le fichier dupliqué des deux côtés, pour une raison précise :
 * le serveur débite ce montant et la vitrine l'affiche. Deux arrondis qui
 * divergent d'un point donneraient un prix barré différent du prix payé — et
 * c'est le genre de détail qui fait perdre confiance en une boutique bien plus
 * vite qu'un bogue visible.
 *
 * Arrondi à l'entier supérieur : la remise reste vraie, et on ne facture jamais
 * une fraction de point.
 */
export function discountedPrice(price, percent) {
    if (!percent || price <= 0) return price;
    const p = Math.min(50, Math.max(15, Math.round(percent)));
    return Math.max(1, Math.ceil(price * (1 - p / 100)));
}

/** Les bornes d'une remise. Une remise sous 15 % ne se remarque pas ; au-delà
 *  de 50 %, l'objet a l'air bradé plutôt que mis en avant. */
export const PROMO_MIN = 15;
export const PROMO_MAX = 50;

/** Au plus dix objets en promotion à la fois : au-delà, ce n'est plus une
 *  sélection, c'est un déstockage, et plus rien ne ressort. */
export const PROMO_SLOTS = 10;

export const itemById = (id) => (id ? ITEMS.find((i) => i.id === id) ?? null : null);
export const itemsForSlot = (slot) => ITEMS.filter((i) => i.slot === slot);

/** Les identifiants vivants, pour la migration et pour le nettoyage. */
export const ALL_IDS = ITEMS.map((i) => i.id);