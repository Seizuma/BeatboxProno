/**
 * Les cadres d'avatar, en pixel art.
 *
 * ─── Pourquoi ce fichier existe ─────────────────────────────────────────────
 *
 * Une bordure CSS est uniforme sur chaque côté : elle ne peut pas avoir un coin
 * différent d'une arête. C'est une limite du langage, et c'est ce qui rendait
 * les cadres précédents interchangeables — on pouvait changer la couleur,
 * l'épaisseur, ajouter un bloc qui court, on restait dans quatre traits droits.
 *
 * `border-image` en découpe neuf tranches lève exactement cette limite : quatre
 * coins protégés, quatre arêtes répétées entre eux. Un cadre redevient donc du
 * DESSIN, dans le même format de grille que les badges.
 *
 * ─── Deux tuiles, pas huit ──────────────────────────────────────────────────
 *
 * On ne décrit qu'un coin et une arête. Les trois autres coins et les trois
 * autres arêtes se déduisent par symétrie. On ne dessine jamais quatre fois la
 * même chose, et un cadre est symétrique par construction — impossible de se
 * tromper d'un pixel sur un seul angle.
 *
 * ─── Six pixels, pas cinq ───────────────────────────────────────────────────
 *
 * La tuile fait six par six. Cinq suffisaient à peine à poser un angle et un
 * plot ; six ouvre trente-six cellules par coin au lieu de vingt-cinq, ce qui
 * change tout pour un motif oblique ou un double filet.
 *
 * La bande vaut donc six pixels, et douze sur le grand avatar de profil — un
 * multiple ENTIER de la tuile, sans quoi le navigateur redimensionne à 0,6 et
 * le pixel n'est plus un pixel.
 */

export const TILE = 6;

const PALETTE = {
    w: '#e8e8e8', y: '#ffe400', c: '#00e8e8', g: '#00d648', m: '#ff3ce8',
    r: '#ff2222', b: '#1414d8', o: '#e8531c', d: '#3a3a3a', k: '#0b0b0b',
};

/* ---------------------------------------------------------------------------
   L'assemblage
   --------------------------------------------------------------------------- */

const rows = (list) => list.map((line) => line.split(''));
const mirrorX = (g) => g.map((row) => [...row].reverse());
const mirrorY = (g) => [...g].reverse();
const transpose = (g) => g[0].map((_, x) => g.map((row) => row[x]));

/**
 * Une planche de 18 × 18 à partir d'un coin et d'une arête de 6 × 6.
 *
 * `coins` permet de désigner explicitement les quatre angles au lieu de les
 * déduire par symétrie. Deux cadres en ont besoin : le voyant d'enregistrement,
 * dont le point rouge ne doit clignoter QUE dans l'angle haut-droit comme sur
 * une caméra, et le tricolore, qui n'existe pas s'il est symétrique. Partout
 * ailleurs la symétrie reste la règle — c'est elle qui garantit qu'on ne se
 * trompe pas d'un pixel sur un seul angle.
 */
function board(cornerLines, edgeLines, opts = {}) {
    const { coins = null, uniform = false, edgeV = null } = opts;
    const corner = rows(cornerLines);
    const edge = rows(edgeLines);

    /**
     * La largeur de l'arête.
     *
     * Six pixels par défaut : la tuile se répète tous les six pixels, ce qui est
     * dense pour un motif figuratif — un cœur tous les six pixels sur le bord
     * d'un avatar en fait cinq par côté, et ça grouille.
     *
     * Une arête de douze donne un motif deux fois moins fréquent sans toucher à
     * la largeur de la BANDE, qui reste six. C'est possible parce que
     * `border-image-slice` découpe par CÔTÉ : sur une planche de 24, une découpe
     * à six laisse une région centrale de douze, et c'est elle qui se répète.
     */
    const EW = edge[0].length;
    const SIDE = TILE * 2 + EW;
    const out = Array.from({ length: SIDE }, () => Array(SIDE).fill('.'));

    const put = (tile, ox, oy) => {
        for (let y = 0; y < tile.length; y += 1) {
            for (let x = 0; x < tile[y].length; x += 1) out[oy + y][ox + x] = tile[y][x];
        }
    };

    if (coins) {
        put(rows(coins.hg), 0, 0);
        put(rows(coins.hd), TILE + EW, 0);
        put(rows(coins.bg), 0, TILE + EW);
        put(rows(coins.bd), TILE + EW, TILE + EW);
    } else if (uniform) {
        // Les quatre angles à l'identique, sans miroir : un motif figuratif —
        // un cœur, une fleur — doit rester à l'endroit sur les quatre côtés.
        // La symétrie le retournerait en bas et le coucherait sur les montants.
        put(corner, 0, 0);
        put(corner, TILE + EW, 0);
        put(corner, 0, TILE + EW);
        put(corner, TILE + EW, TILE + EW);
    } else {
        put(corner, 0, 0);
        put(mirrorX(corner), TILE + EW, 0);
        put(mirrorY(corner), 0, TILE + EW);
        put(mirrorY(mirrorX(corner)), TILE + EW, TILE + EW);
    }

    put(edge, TILE, 0);
    put(uniform ? edge : mirrorY(edge), TILE, TILE + EW);

    /**
     * Les montants.
     *
     * Par défaut, la tuile horizontale pivotée d'un quart de tour : pour un
     * motif abstrait — un filet, des créneaux — c'est exactement ce qu'on veut.
     *
     * Un motif figuratif, lui, se coucherait. Il fournit alors `edgeV`, sa
     * propre tuile verticale, dessinée à l'endroit. Ce n'est pas une redite du
     * dessin horizontal : c'est le même objet vu sur un montant, et il n'y a
     * aucune transformation géométrique qui produise ça.
     */
    const gauche = edgeV ? rows(edgeV) : transpose(edge);
    const droite = edgeV ? rows(edgeV) : mirrorX(transpose(edge));
    put(gauche, 0, TILE);
    put(droite, TILE + EW, TILE);

    return out;
}

/**
 * La planche vers une image encodée dans le CSS.
 *
 * `encodeURIComponent` sur la totalité : il échappe d'un coup les dièses des
 * couleurs, les chevrons et les guillemets. Sans lui, le premier guillemet du
 * SVG referme la déclaration CSS et le cadre disparaît sans erreur — ça m'est
 * arrivé, et le symptôme ne dit rien de sa cause.
 */
function dataUrl(cells) {
    let rects = '';
    cells.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            if (ch === '.') { x += 1; continue; }
            let n = 1;
            while (row[x + n] === ch) n += 1;
            rects += `<rect x='${x}' y='${y}' width='${n}' height='1' fill='${PALETTE[ch]}'/>`;
            x += n;
        }
    });
    const size = cells.length;
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' ` +
        `shape-rendering='crispEdges'>${rects}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const frameSource = (corner, edge, opts = {}) => dataUrl(board(corner, edge, opts));

/* ---------------------------------------------------------------------------
   Le catalogue de dessins

   `tint` sert aux avatars trop petits pour porter un dessin : sous une certaine
   taille, un motif de six pixels sur une photo de vingt-six devient une bouillie.
   Le cadre y retombe sur un filet plein de sa couleur dominante — reconnaissable,
   honnête, et lisible.
   --------------------------------------------------------------------------- */

export const FRAME_ART = {
    /* --- Statiques --------------------------------------------------------- */
    'frame-filet': {
        tint: 'c',
        corner: ['cccccc', 'c.....', 'c.....', 'c.....', 'c.....', 'c.....'],
        edge: ['cccccc', '......', '......', '......', '......', '......'],
    },
    'frame-equerres': {
        tint: 'w',
        corner: ['wwwwww', 'ww....', 'ww....', 'w.....', 'w.....', 'w.....'],
        edge: ['......', '......', '......', '......', '......', '......'],
    },
    'frame-grille': {
        tint: 'w',
        corner: ['wwwwww', 'w.....', 'w.....', 'w.....', 'w.....', 'w.....'],
        edge: ['w.w.w.', '.w.w.w', 'w.w.w.', '......', '......', '......'],
    },
    'frame-pellicule': {
        tint: 'w',
        corner: ['wwwwww', 'w.....', 'w.....', 'w.....', 'w.....', 'w.....'],
        edge: ['wwwwww', '.ww.ww', '.ww.ww', '......', '......', '......'],
    },
    'frame-chevrons': {
        tint: 'y',
        corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
        edge: ['y...y.', '.y...y', '..y...', '...y..', '......', '......'],
    },
    'frame-double': {
        tint: 'c',
        corner: ['cccccc', 'c.....', 'cccccc', 'c.c...', 'c.c...', 'c.c...'],
        edge: ['cccccc', '......', 'cccccc', '......', '......', '......'],
    },
    'frame-ruban': {
        tint: 'm',
        corner: ['..mmmm', '.mmmm.', 'mmmm..', 'mmm...', 'mm....', 'm.....'],
        edge: ['mmmmmm', 'm....m', '......', '......', '......', '......'],
    },
    'frame-cube': {
        tint: 'o',
        corner: ['oooo..', 'ooo...', 'oo....', 'o.....', '......', '......'],
        edge: ['......', '......', '......', '......', '......', '......'],
    },
    /**
     * Le tricolore.
     *
     * Il n'avait pas de rouge du tout : deux bleus symétriques et du blanc. Un
     * drapeau tricolore est asymétrique par nature — bleu à gauche, rouge à
     * droite — et c'est précisément ce que la symétrie automatique interdisait.
     * D'où les quatre coins désignés à la main.
     */
    'frame-tricolore': {
        tint: 'w',
        corner: ['bbbbbb', 'bbb...', 'bbb...', 'bbb...', 'bbb...', 'bbb...'],
        edge: ['wwwwww', 'wwwwww', '......', '......', '......', '......'],
        coins: {
            hg: ['bbbbbb', 'bbb...', 'bbb...', 'bbb...', 'bbb...', 'bbb...'],
            hd: ['rrrrrr', '...rrr', '...rrr', '...rrr', '...rrr', '...rrr'],
            bg: ['bbb...', 'bbb...', 'bbb...', 'bbb...', 'bbb...', 'bbbbbb'],
            bd: ['...rrr', '...rrr', '...rrr', '...rrr', '...rrr', 'rrrrrr'],
        },
    },
    'frame-cypher': {
        tint: 'm',
        corner: ['mm....', 'mm....', '......', '......', '......', '......'],
        edge: ['..mm..', '..mm..', '......', '......', '......', '......'],
    },
    /**
     * Les cœurs.
     *
     * ─── Chaque ligne est son propre miroir ─────────────────────────────────
     *
     * C'est la seule règle qui compte ici, et je l'avais manquée. La pointe du
     * cœur tombait un demi-pixel à gauche de l'échancrure, ce qui ne se voit
     * pas sur une grille de caractères mais saute aux yeux à l'écran : un cœur
     * de travers ne se lit plus comme un cœur.
     *
     * Un pixel n'a pas de moitié. Sur une largeur PAIRE, l'axe passe entre deux
     * colonnes, donc toute forme centrée doit avoir un nombre pair de pixels sur
     * chaque ligne — d'où l'échancrure de deux et non de un.
     *
     * Le motif occupe les six lignes de la bande : à cette taille, une ligne
     * gagnée sur la hauteur change beaucoup la lecture.
     */
    'frame-coeurs': {
        tint: 'r', uniform: true, repeat: 'space',
        corner: ['rr..rr', 'rrrrrr', 'rrrrrr', 'rrrrrr', '.rrrr.', '..rr..'],
        edge: [
            '...rr..rr...',
            '...rrrrrr...',
            '...rrrrrr...',
            '...rrrrrr...',
            '....rrrr....',
            '.....rr.....',
        ],
        edgeV: [
            '......', '......', '......',
            'rr..rr', 'rrrrrr', 'rrrrrr', 'rrrrrr', '.rrrr.', '..rr..',
            '......', '......', '......',
        ],
    },

    /**
     * Les fleurs.
     *
     * Une corolle pleine de six pixels avec deux pixels de cœur jaune. La
     * version précédente était un anneau de quatre pixels : à l'écran, un
     * anneau de cette taille se lit comme un carré évidé, pas comme une fleur.
     * C'est le cœur jaune qui fait la différence, et il lui faut de la matière
     * autour pour ressortir.
     */
    'frame-fleurs': {
        tint: 'm', uniform: true, repeat: 'space',
        corner: ['..mm..', '.mmmm.', 'mmyymm', '.mmmm.', '..mm..', '......'],
        edge: [
            '.....mm.....',
            '....mmmm....',
            '...mmyymm...',
            '....mmmm....',
            '.....mm.....',
            '............',
        ],
        edgeV: [
            '......', '......', '......',
            '..mm..', '.mmmm.', 'mmyymm', '.mmmm.', '..mm..',
            '......', '......', '......', '......',
        ],
    },

    'frame-cabine': {
        tint: 'g',
        corner: ['gggggg', 'ggggg.', 'gggg..', 'ggg...', 'gg....', 'g.....'],
        edge: ['g.....', '......', '......', '......', '......', '......'],
    },
};

/* ---------------------------------------------------------------------------
   Les animations

   Deux familles, et elles ne servent pas au même usage.

   PAR CRANS — `border-image-source` ne s'interpole pas : dans une animation,
   elle bascule d'un état à l'autre d'un coup. C'est un défaut pour un dégradé,
   c'est exactement ce qu'on veut ici : de la vraie animation image par image,
   dessinée à la main. Rien d'autre en CSS ne fait ça.

   FLUIDES — mais tout ne mérite pas d'être saccadé. Un fondu entre deux dessins,
   un cadre qui respire : ce sont des propriétés qui S'INTERPOLENT, donc deux
   copies superposées du cadre et une opacité qui passe de l'une à l'autre. Le
   dessin reste net, le mouvement devient continu.
   --------------------------------------------------------------------------- */

export const FRAME_ANIM = {
    /* --- Par crans --------------------------------------------------------- */
    /**
     * La lampe qui court.
     *
     * Le filet est désormais CONTINU sous la lampe. Auparavant l'arête se vidait
     * entre deux passages, et le cadre paraissait cassé trois fois sur quatre —
     * c'est le « cadre noir » qu'on voyait, en réalité un trou.
     *
     * Et deux fois plus vite : à quatre secondes, une lampe qui court n'a plus
     * l'air de courir.
     */
    'frame-course': {
        tint: 'y', kind: 'steps', duration: 2,
        states: [
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['yyyyyy', 'yy....', '......', '......', '......', '......'] },
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['yyyyyy', '..yy..', '......', '......', '......', '......'] },
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['yyyyyy', '....yy', '......', '......', '......', '......'] },
        ],
    },
    /**
     * RGB.
     *
     * Pas trois états qui sautent : une teinte qui GLISSE, comme sur un clavier
     * ou une barrette de mémoire. Or `border-image-source` ne s'interpole pas —
     * trois planches donnaient un clignotement, jamais un dégradé.
     *
     * La sortie est une rotation de teinte appliquée à un cadre unique dessiné
     * en rouge saturé. `hue-rotate` de zéro à trois cent soixante degrés
     * parcourt tout le spectre sans un seul saut, et c'est une propriété qui
     * S'INTERPOLE.
     *
     * Elle porte sur un pseudo-élément et non sur la boîte : sur la boîte, le
     * filtre repeindrait aussi la photo de l'avatar.
     */
    'frame-rgb': {
        tint: 'r', kind: 'hue', duration: 5,
        states: [
            { corner: ['rrrrrr', 'rr....', 'r.....', 'r.....', 'r.....', 'r.....'],
              edge: ['rrrrrr', 'r.....', '......', '......', '......', '......'] },
        ],
    },

        /**
     * Le voyant d'enregistrement.
     *
     * Le contour est ROUGE et fixe, de la même teinte que la lampe. Il était
     * blanc, et le contraste blanc/rouge faisait lire le point comme un défaut
     * du cadre plutôt que comme un témoin. En monochrome, ce qui bouge est le
     * seul événement de l'image : la lampe apparaît et disparaît, le boîtier ne
     * bouge pas — c'est exactement ce que fait une caméra.
     *
     * Le point reste DÉCOLLÉ du filet — un pixel de vide sur ses deux côtés.
     * Maintenant qu'ils sont de la même couleur, cet écart est la seule chose
     * qui les distingue : collé, la lampe deviendrait un épaississement.
     *
     * Seul l'angle haut-droit le porte, là où tous les appareils le placent.
     * D'où les quatre coins désignés à la main : par symétrie, quatre témoins
     * s'allumeraient, et quatre témoins ne sont plus un témoin.
     */
    'frame-rec': {
        tint: 'r', kind: 'steps', duration: 2.8,
        states: [
            {
                corner: ['rrrrrr', 'r.....', 'r.....', 'r.....', 'r.....', 'r.....'],
                edge: ['rrrrrr', '......', '......', '......', '......', '......'],
                coins: {
                    hg: ['rrrrrr', 'r.....', 'r.....', 'r.....', 'r.....', 'r.....'],
                    hd: ['rrrrrr', '.....r', '.rrr.r', '.rrr.r', '.rrr.r', '.....r'],
                    bg: ['r.....', 'r.....', 'r.....', 'r.....', 'r.....', 'rrrrrr'],
                    bd: ['.....r', '.....r', '.....r', '.....r', '.....r', 'rrrrrr'],
                },
            },
            {
                corner: ['rrrrrr', 'r.....', 'r.....', 'r.....', 'r.....', 'r.....'],
                edge: ['rrrrrr', '......', '......', '......', '......', '......'],
                coins: {
                    hg: ['rrrrrr', 'r.....', 'r.....', 'r.....', 'r.....', 'r.....'],
                    hd: ['rrrrrr', '.....r', '.....r', '.....r', '.....r', '.....r'],
                    bg: ['r.....', 'r.....', 'r.....', 'r.....', 'r.....', 'rrrrrr'],
                    bd: ['.....r', '.....r', '.....r', '.....r', '.....r', 'rrrrrr'],
                },
            },
        ],
    },

    /* --- Fluides ----------------------------------------------------------- */
    'frame-braise': {
        tint: 'r', kind: 'fade', duration: 3.6,
        states: [
            { corner: ['rrrrrr', 'r.....', 'r.....', 'r.....', 'r.....', 'r.....'],
              edge: ['r.r.r.', '......', '......', '......', '......', '......'] },
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['.y.y.y', '......', '......', '......', '......', '......'] },
        ],
    },
    'frame-relais': {
        tint: 'm', kind: 'fade', duration: 6,
        states: [
            { corner: ['mmmmmm', 'm.....', 'm.....', 'm.....', 'm.....', 'm.....'],
              edge: ['mmm...', 'mmm...', '......', '......', '......', '......'] },
            { corner: ['cccccc', 'c.....', 'c.....', 'c.....', 'c.....', 'c.....'],
              edge: ['...ccc', '...ccc', '......', '......', '......', '......'] },
        ],
    },
    'frame-souffle': {
        tint: 'w', kind: 'breathe', duration: 5.5,
        states: [
            { corner: ['wwwwww', 'w.....', 'w.....', 'w.....', 'w.....', 'w.....'],
              edge: ['wwwwww', '..ww..', '......', '......', '......', '......'] },
        ],
    },
};

/* ---------------------------------------------------------------------------
   La feuille de styles

   Générée depuis les dessins plutôt qu'écrite à la main. Ajouter un cadre est
   donc une grille de plus dans ce fichier, et rien d'autre : pas de CSS à tenir
   d'accord avec un catalogue, pas de risque qu'ils divergent.

   Le poids paraît lourd — deux kilo-octets par cadre — mais c'est du texte très
   répétitif : compressé, l'ensemble tient dans quelques kilo-octets, sans une
   seule requête réseau ni un nœud DOM de plus.
   --------------------------------------------------------------------------- */

const SIZES = [
    // La bande suit la taille de l'avatar, en multiples ENTIERS de la tuile.
    // À 0,6 ou 1,4 fois, le navigateur rééchantillonne et le pixel se salit.
    ['.cos-frame--sm', TILE],
    ['.cos-frame--md', TILE],
    ['.cos-frame--lg', TILE * 2],
];

export function frameStylesheet() {
    const out = [];

    // Le socle : la bordure devient transparente, l'image la remplace.
    out.push(
        `[class*="cos-f-"]{border-style:solid;border-color:transparent;` +
        `border-image-slice:${TILE};border-image-repeat:repeat;image-rendering:pixelated}`
    );

    /**
     * `space` pour les motifs figuratifs.
     *
     * `repeat` répète la tuile et TRONQUE la dernière : une tuile de douze
     * pixels dans un côté de trente entre 2,47 fois, donc la troisième arrive
     * coupée en deux. Sur un filet, personne ne le voit ; sur un cœur, ça donne
     * une moitié de cœur, et c'est exactement ce qu'on voyait.
     *
     * `space` ne pose que des tuiles ENTIÈRES et répartit le reste en écarts
     * égaux. Aucune mise à l'échelle, donc le pixel reste un pixel — ce que
     * `round` aurait cassé en étirant la tuile pour la faire tomber juste.
     */
    for (const [sel, w] of SIZES) {
        // `--cos-band` EST la largeur de bande, et elle doit descendre jusqu'au
        // pseudo-élément des cadres fondus : sans cette déclaration, celui-ci
        // lisait son repli de six pixels pendant que la boîte en portait douze,
        // et les deux dessins se voyaient l'un DANS l'autre au lieu de l'un SUR
        // l'autre. Le symptôme n'apparaissait qu'en `lg`, la seule taille qui
        // s'écarte de la tuile.
        out.push(
            `${sel}[class*="cos-f-"]{--cos-band:${w}px;border-width:${w}px;border-image-width:${w}px}`
        );
    }

    // Sous cette taille, le dessin devient illisible : filet plein.
    const tints = [];
    for (const [id, art] of Object.entries({ ...FRAME_ART, ...FRAME_ANIM })) {
        const k = id.replace('frame-', '');
        tints.push(`.cos-frame--xs.cos-f-${k}{border:2px solid ${PALETTE[art.tint]};border-image:none;animation:none}`);
        // Le filet plein remplace le dessin : le second calque des cadres
        // fondus n'a plus rien à recouvrir, et le laisser vivant repeignait un
        // cadre de six pixels par-dessus une bordure de deux.
        tints.push(`.cos-frame--xs.cos-f-${k}::after{display:none}`);
    }
    out.push(tints.join('\n'));

    for (const [id, art] of Object.entries(FRAME_ART)) {
        const key = id.replace('frame-', '');
        out.push(`.cos-f-${key}{border-image-source:${frameSource(art.corner, art.edge, art)}}`);
        if (art.repeat) out.push(`.cos-f-${key}{border-image-repeat:${art.repeat}}`);
    }

    for (const [id, art] of Object.entries(FRAME_ANIM)) {
        const key = id.replace('frame-', '');
        const first = frameSource(art.states[0].corner, art.states[0].edge, art.states[0]);

        if (art.kind === 'steps') {
            const frames = art.states
                .map((s, i) => `${Math.round((i / art.states.length) * 100)}%{border-image-source:${frameSource(s.corner, s.edge, s)}}`)
                .join('');
            out.push(`@keyframes cosf-${key}{${frames}}`);
            out.push(`.cos-f-${key}{border-image-source:${first};animation:cosf-${key} ${art.duration}s steps(1,end) infinite}`);
            continue;
        }

        if (art.kind === 'fade') {
            // Deux dessins superposés, une opacité qui passe de l'un à l'autre.
            // Le pseudo-élément porte le second et se cale sur la bordure grâce à
            // un `inset` négatif de la largeur de bande.
            const second = frameSource(art.states[1].corner, art.states[1].edge, art.states[1]);
            out.push(`.cos-f-${key}{border-image-source:${first};position:relative}`);
            out.push(
                `.cos-f-${key}::after{content:'';position:absolute;inset:calc(-1 * var(--cos-band,${TILE}px));` +
                `border:var(--cos-band,${TILE}px) solid transparent;border-image-slice:${TILE};` +
                `border-image-width:var(--cos-band,${TILE}px);` +
                `border-image-repeat:repeat;border-image-source:${second};image-rendering:pixelated;` +
                `pointer-events:none;animation:cosf-fade ${art.duration}s ease-in-out infinite}`
            );
            continue;
        }

        if (art.kind === 'hue') {
            // Le cadre est porté par un pseudo-élément, seul à subir le filtre.
            out.push(`.cos-f-${key}{position:relative}`);
            out.push(
                `.cos-f-${key}::after{content:'';position:absolute;inset:calc(-1 * var(--cos-band,${TILE}px));` +
                `border:var(--cos-band,${TILE}px) solid transparent;border-image-slice:${TILE};` +
                `border-image-width:var(--cos-band,${TILE}px);` +
                `border-image-repeat:repeat;border-image-source:${first};image-rendering:pixelated;` +
                `pointer-events:none;animation:cosf-hue ${art.duration}s linear infinite}`
            );
            continue;
        }

        if (art.kind === 'breathe') {
            out.push(`.cos-f-${key}{border-image-source:${first};animation:cosf-breathe ${art.duration}s ease-in-out infinite}`);
            continue;
        }

    }

    out.push(`@keyframes cosf-fade{0%,100%{opacity:0}50%{opacity:1}}`);
    out.push(`@keyframes cosf-breathe{0%,100%{opacity:.4}50%{opacity:1}}`);
    // Linéaire et sur un tour complet : revenir en arrière ferait osciller la
    // couleur au lieu de la faire tourner.
    out.push(`@keyframes cosf-hue{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}`);

    // Quelqu'un qui a demandé moins d'animations en a assez vu.
    out.push(
        `@media (prefers-reduced-motion:reduce){` +
        `[class*="cos-f-"],[class*="cos-f-"]::after{animation:none!important}` +
        `[class*="cos-f-"]::after{opacity:1}}`
    );

    return out.join('\n');
}

/**
 * Pose la feuille dans le document, une seule fois.
 *
 * Appelée explicitement depuis `main.jsx` plutôt qu'en effet de bord à
 * l'import : une feuille de styles qui apparaît parce qu'un module a été chargé
 * quelque part est le genre de chose qu'on cherche pendant une heure.
 */
export function installFrames() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('cos-frames')) return;
    const style = document.createElement('style');
    style.id = 'cos-frames';
    style.textContent = frameStylesheet();
    document.head.appendChild(style);
}