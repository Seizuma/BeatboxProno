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

/** Une planche de 18 × 18 à partir d'un coin et d'une arête de 6 × 6. */
function board(cornerLines, edgeLines) {
    const corner = rows(cornerLines);
    const edge = rows(edgeLines);
    const out = Array.from({ length: TILE * 3 }, () => Array(TILE * 3).fill('.'));

    const put = (tile, ox, oy) => {
        for (let y = 0; y < TILE; y += 1) {
            for (let x = 0; x < TILE; x += 1) out[oy + y][ox + x] = tile[y][x];
        }
    };

    put(corner, 0, 0);
    put(mirrorX(corner), TILE * 2, 0);
    put(mirrorY(corner), 0, TILE * 2);
    put(mirrorY(mirrorX(corner)), TILE * 2, TILE * 2);

    put(edge, TILE, 0);
    put(mirrorY(edge), TILE, TILE * 2);
    put(transpose(edge), 0, TILE);
    put(mirrorX(transpose(edge)), TILE * 2, TILE);

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
    const size = TILE * 3;
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' ` +
        `shape-rendering='crispEdges'>${rects}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const frameSource = (corner, edge) => dataUrl(board(corner, edge));

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
    'frame-rivets': {
        tint: 'w',
        corner: ['wwwwww', 'w.....', 'w.ww..', 'w.ww..', 'w.....', 'w.....'],
        edge: ['wwwwww', '..ww..', '..ww..', '......', '......', '......'],
    },
    'frame-creneaux': {
        tint: 'c',
        corner: ['cccccc', 'c.....', 'c.....', 'c.....', 'c.....', 'c.....'],
        edge: ['cccccc', 'ccc...', 'ccc...', '......', '......', '......'],
    },
    'frame-grille': {
        tint: 'w',
        corner: ['wwwwww', 'w.....', 'w.....', 'w.....', 'w.....', 'w.....'],
        edge: ['w.w.w.', '.w.w.w', 'w.w.w.', '......', '......', '......'],
    },
    'frame-pistes': {
        tint: 'g',
        corner: ['wwwwww', 'w.....', 'w.....', 'w.....', 'w.....', 'w.....'],
        edge: ['gggg.g', 'gggg.g', '......', '......', '......', '......'],
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
    'frame-vis': {
        tint: 'w',
        corner: ['.wwww.', 'w.ww.w', 'wwwwww', 'ww..ww', 'w.ww.w', '.wwww.'],
        edge: ['..ww..', '......', '......', '......', '......', '......'],
    },
    'frame-ruban': {
        tint: 'm',
        corner: ['..mmmm', '.mmmm.', 'mmmm..', 'mmm...', 'mm....', 'm.....'],
        edge: ['mmmmmm', 'm....m', '......', '......', '......', '......'],
    },
    'frame-jury': {
        tint: 'y',
        corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
        edge: ['yy.yy.', 'yy.yy.', '......', '......', '......', '......'],
    },
    'frame-cube': {
        tint: 'o',
        corner: ['oooo..', 'ooo...', 'oo....', 'o.....', '......', '......'],
        edge: ['......', '......', '......', '......', '......', '......'],
    },
    'frame-tricolore': {
        tint: 'w',
        corner: ['bbbwww', 'bbb...', 'bbb...', 'bbb...', 'bbb...', 'bbb...'],
        edge: ['wwwwww', 'wwwwww', '......', '......', '......', '......'],
    },
    'frame-cypher': {
        tint: 'm',
        corner: ['mm....', 'mm....', '......', '......', '......', '......'],
        edge: ['..mm..', '..mm..', '......', '......', '......', '......'],
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
   une bande qui glisse, un cadre qui respire : ce sont des propriétés qui
   S'INTERPOLENT, donc deux copies superposées du cadre et une opacité qui passe
   de l'une à l'autre. Le dessin reste net, le mouvement devient continu.
   --------------------------------------------------------------------------- */

export const FRAME_ANIM = {
    /* --- Par crans --------------------------------------------------------- */
    'frame-course': {
        tint: 'y', kind: 'steps', duration: 4,
        states: [
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['yy....', 'yy....', '......', '......', '......', '......'] },
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['..yy..', '..yy..', '......', '......', '......', '......'] },
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['....yy', '....yy', '......', '......', '......', '......'] },
            { corner: ['yyyyyy', 'y.....', 'y.....', 'y.....', 'y.....', 'y.....'],
              edge: ['......', '......', '......', '......', '......', '......'] },
        ],
    },
    'frame-rec': {
        tint: 'r', kind: 'steps', duration: 2.8,
        states: [
            { corner: ['rrrrrr', 'r.....', 'r.rr..', 'r.rr..', 'r.....', 'r.....'],
              edge: ['rrrrrr', '..rr..', '......', '......', '......', '......'] },
            { corner: ['dddddd', 'd.....', 'd.....', 'd.....', 'd.....', 'd.....'],
              edge: ['dddddd', '......', '......', '......', '......', '......'] },
        ],
    },
    'frame-scan': {
        tint: 'c', kind: 'steps', duration: 3,
        states: [
            { corner: ['cccccc', 'cc....', 'c.....', 'c.....', 'c.....', 'c.....'],
              edge: ['cccccc', '......', '......', '......', '......', '......'] },
            { corner: ['cccccc', 'c.....', 'cc....', 'cc....', 'c.....', 'c.....'],
              edge: ['cccccc', '......', '......', '......', '......', '......'] },
            { corner: ['cccccc', 'c.....', 'c.....', 'c.....', 'cc....', 'cc....'],
              edge: ['cccccc', '......', '......', '......', '......', '......'] },
        ],
    },

    /* --- Fluides ----------------------------------------------------------- */
    'frame-onde': {
        tint: 'c', kind: 'fade', duration: 5,
        states: [
            { corner: ['cccccc', 'c.....', 'c.....', 'c.....', 'c.....', 'c.....'],
              edge: ['cccccc', '......', '......', '......', '......', '......'] },
            { corner: ['cccccc', 'cccccc', 'cc....', 'cc....', 'cc....', 'cc....'],
              edge: ['cccccc', 'cccccc', '......', '......', '......', '......'] },
        ],
    },
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
    'frame-glisse': {
        tint: 'g', kind: 'slide', duration: 7,
        states: [
            { corner: ['gggggg', 'g.....', 'g.....', 'g.....', 'g.....', 'g.....'],
              edge: ['gggggg', '......', '......', '......', '......', '......'] },
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
    for (const [sel, w] of SIZES) {
        out.push(`${sel}[class*="cos-f-"]{border-width:${w}px;border-image-width:${w}px}`);
    }

    // Sous cette taille, le dessin devient illisible : filet plein.
    const tints = [];
    for (const [id, art] of Object.entries({ ...FRAME_ART, ...FRAME_ANIM })) {
        tints.push(`.cos-frame--xs.cos-f-${id.replace('frame-', '')}{border:2px solid ${PALETTE[art.tint]};border-image:none;animation:none}`);
    }
    out.push(tints.join('\n'));

    for (const [id, art] of Object.entries(FRAME_ART)) {
        out.push(`.cos-f-${id.replace('frame-', '')}{border-image-source:${frameSource(art.corner, art.edge)}}`);
    }

    for (const [id, art] of Object.entries(FRAME_ANIM)) {
        const key = id.replace('frame-', '');
        const first = frameSource(art.states[0].corner, art.states[0].edge);

        if (art.kind === 'steps') {
            const frames = art.states
                .map((s, i) => `${Math.round((i / art.states.length) * 100)}%{border-image-source:${frameSource(s.corner, s.edge)}}`)
                .join('');
            out.push(`@keyframes cosf-${key}{${frames}}`);
            out.push(`.cos-f-${key}{border-image-source:${first};animation:cosf-${key} ${art.duration}s steps(1,end) infinite}`);
            continue;
        }

        if (art.kind === 'fade') {
            // Deux dessins superposés, une opacité qui passe de l'un à l'autre.
            // Le pseudo-élément porte le second et se cale sur la bordure grâce à
            // un `inset` négatif de la largeur de bande.
            const second = frameSource(art.states[1].corner, art.states[1].edge);
            out.push(`.cos-f-${key}{border-image-source:${first};position:relative}`);
            out.push(
                `.cos-f-${key}::after{content:'';position:absolute;inset:calc(-1 * var(--cos-band,${TILE}px));` +
                `border:var(--cos-band,${TILE}px) solid transparent;border-image-slice:${TILE};` +
                `border-image-repeat:repeat;border-image-source:${second};image-rendering:pixelated;` +
                `pointer-events:none;animation:cosf-fade ${art.duration}s ease-in-out infinite}`
            );
            continue;
        }

        if (art.kind === 'breathe') {
            out.push(`.cos-f-${key}{border-image-source:${first};animation:cosf-breathe ${art.duration}s ease-in-out infinite}`);
            continue;
        }

        if (art.kind === 'slide') {
            // Le dessin ne bouge pas ; c'est un bloc plein qui glisse le long du
            // filet, en mouvement continu. Le seul cadre qui combine les deux.
            out.push(`.cos-f-${key}{border-image-source:${first};position:relative}`);
            out.push(
                `.cos-f-${key}::after{content:'';position:absolute;width:34%;height:var(--cos-band,${TILE}px);` +
                `background:${PALETTE[art.tint]};top:calc(-1 * var(--cos-band,${TILE}px));left:0;` +
                `pointer-events:none;animation:cosf-run ${art.duration}s linear infinite}`
            );
        }
    }

    out.push(`@keyframes cosf-fade{0%,100%{opacity:0}50%{opacity:1}}`);
    out.push(`@keyframes cosf-breathe{0%,100%{opacity:.4}50%{opacity:1}}`);
    out.push(
        `@keyframes cosf-run{` +
        `0%{top:calc(-1 * var(--cos-band,6px));left:0;width:34%;height:var(--cos-band,6px);margin:0}` +
        `25%{top:calc(-1 * var(--cos-band,6px));left:66%;width:34%;height:var(--cos-band,6px);margin:0}` +
        `25.1%{top:0;left:100%;width:var(--cos-band,6px);height:34%;margin-left:calc(-1 * var(--cos-band,6px))}` +
        `50%{top:66%;left:100%;width:var(--cos-band,6px);height:34%;margin-left:calc(-1 * var(--cos-band,6px))}` +
        `50.1%{top:100%;left:66%;width:34%;height:var(--cos-band,6px);margin-top:calc(-1 * var(--cos-band,6px));margin-left:0}` +
        `75%{top:100%;left:0;width:34%;height:var(--cos-band,6px);margin-top:calc(-1 * var(--cos-band,6px))}` +
        `75.1%{top:66%;left:calc(-1 * var(--cos-band,6px));width:var(--cos-band,6px);height:34%;margin-top:0}` +
        `100%{top:0;left:calc(-1 * var(--cos-band,6px));width:var(--cos-band,6px);height:34%}}`
    );

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