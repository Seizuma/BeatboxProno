/**
 * Le pixel art du site : badges d'événement et bandes de profil.
 *
 * ─── Pourquoi des chaînes de caractères ─────────────────────────────────────
 *
 * Chaque dessin est un tableau de lignes, un caractère par pixel, un caractère
 * par couleur. C'est lisible dans l'éditeur, modifiable à la main, et un diff
 * git montre exactement quel pixel a bougé — ce qu'aucun PNG ne saura jamais
 * faire. Un badge pèse environ un kilo-octet de source et zéro requête réseau.
 *
 * ─── Pourquoi ce fichier ne contient PAS les cadres ─────────────────────────
 *
 * Un cadre animé dessiné en SVG, c'est cent cinquante rectangles porteurs
 * chacun de leur propre décalage d'animation. Multiplié par cinquante lignes de
 * classement, la page devient injouable. Les cadres sont donc en CSS pur —
 * bordures, pseudo-éléments et `steps()` — dans `shop.css`. Zéro nœud DOM,
 * zéro coût dans un tableau.
 *
 * Le pixel art reste pour ce qui s'affiche à l'unité : les badges d'un profil
 * et les deux bandes qui l'encadrent.
 */

/* Les six pures du P411, plus deux citations réservées aux badges : l'orange de
   la compétition et le bronze d'une médaille. Elles ne servent nulle part
   ailleurs — c'est la condition pour que la charte tienne. */
export const CSS_COLOR = {
    w: 'var(--w, #e8e8e8)',
    y: 'var(--y)',
    c: 'var(--c)',
    g: 'var(--g)',
    m: 'var(--m)',
    r: 'var(--r)',
    b: 'var(--b)',
    o: 'var(--o, #e8531c)',
    z: 'var(--bz, #b06a2c)',
    d: 'var(--line, #3a3a3a)',
    k: '#000000',
};

/* Le canvas d'export ne sait pas résoudre une variable CSS : il lui faut des
   valeurs. Les deux tables doivent rester alignées. */
export const HEX_COLOR = {
    w: '#e8e8e8', y: '#ffe400', c: '#00e8e8', g: '#00d648', m: '#ff3ce8',
    r: '#ff2222', b: '#0a0aff', o: '#e8531c', z: '#b06a2c', d: '#3a3a3a', k: '#000000',
};

/* --------------------------------------------------------------------------
   Le tracé
   -------------------------------------------------------------------------- */

const blank = (w, h, ch = '.') => Array.from({ length: h }, () => ch.repeat(w).split(''));
const freeze = (g) => g.map((row) => row.join(''));

function inPolygon(px, py, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Bresenham, avec une épaisseur en pixels pour les arêtes du cube. */
function stroke(g, [x0, y0], [x1, y1], ch, thickness = 1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
        for (let k = 0; k < thickness; k += 1) {
            if (g[y0] && g[y0][x0 + k] !== undefined) g[y0][x0 + k] = ch;
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

/* --------------------------------------------------------------------------
   Le cube
   -------------------------------------------------------------------------- */

/**
 * La géométrie du cube.
 *
 * Quarante pixels de large. Vingt suffisaient à faire une silhouette, pas à
 * porter des fractures lisibles : à cette taille elles mangeaient une facette
 * entière.
 *
 * ─── Pourquoi il avait l'air écrasé ─────────────────────────────────────────
 *
 * Les arêtes verticales mesuraient vingt pixels, soit exactement la hauteur du
 * losange du dessus. Un volume aussi haut que large en projection, c'est ce que
 * l'œil lit comme une DALLE vue de dessus, pas comme un cube — et c'est le
 * retour qu'on a eu, mot pour mot.
 *
 * Elles passent à vingt-six, soit 0,65 fois la largeur. Le rapport n'est pas
 * une préférence : en projection deux pour un, c'est celui qui fait lire un
 * cube plutôt qu'une brique. Le badge gagne six pixels de haut, ce qui ne
 * change rien à sa place dans une rangée.
 */
const SIDE = 40;
const RISE = 26;
const TOP_H = 20;
const H = TOP_H + RISE;

const FACE_TOP = [[20, 0], [40, 10], [20, TOP_H], [0, 10]];
const FACE_LEFT = [[0, 10], [20, TOP_H], [20, H], [0, 10 + RISE]];
const FACE_RIGHT = [[40, 10], [20, TOP_H], [20, H], [40, 10 + RISE]];

const EDGES = [
    [[20, 0], [39, 10]], [[39, 10], [20, TOP_H]], [[20, TOP_H], [1, 10]], [[1, 10], [20, 0]],
    [[0, 10], [0, 9 + RISE]], [[39, 10], [39, 9 + RISE]], [[20, TOP_H], [20, H - 1]],
    [[0, 9 + RISE], [20, H - 1]], [[39, 9 + RISE], [20, H - 1]],
];

// Les fractures. Trois entailles obliques, une par facette, tracées en couleur
// de fond : c'est ce qui donne au cube son air scindé sans copier la géométrie
// de personne. Les deux du bas suivent l'allongement des faces latérales.
const CRACKS = [
    [[9, 8], [20, 14]],
    [[6, 22], [13, 38]],
    [[28, 19], [34, 32]],
];

/**
 * @param {object} o
 * @param {string} [o.top] [o.left] [o.right]  couleur de remplissage d'une face
 * @param {string} [o.edge]      couleur des arêtes
 * @param {string} [o.field]     fond de la vignette (le vainqueur seul en a un)
 * @param {number} [o.pedestal]  nombre d'étages de socle
 * @param {string} [o.pedColor]
 */
export function cube(o) {
    const height = o.pedestal ? H + 2 + o.pedestal * 3 : H;
    const g = blank(SIDE, height, o.field || '.');

    const faces = [[FACE_TOP, o.top], [FACE_LEFT, o.left], [FACE_RIGHT, o.right]];
    for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < SIDE; x += 1) {
            for (const [poly, fill] of faces) {
                if (inPolygon(x + 0.5, y + 0.5, poly)) { if (fill) g[y][x] = fill; break; }
            }
        }
    }

    if (o.edge) EDGES.forEach(([a, b]) => stroke(g, a, b, o.edge, 2));
    CRACKS.forEach(([a, b]) => stroke(g, a, b, o.field || '.', 2));

    // Le socle s'élargit vers le bas : l'inverse donnait une pyramide en
    // équilibre sur sa pointe, ce qui a l'air d'un accident plutôt que d'un
    // podium.
    if (o.pedestal) {
        for (let s = 0; s < o.pedestal; s += 1) {
            const y0 = H + 2 + s * 3;
            const half = 7 + s * 6;
            for (let y = y0; y < y0 + 3; y += 1) {
                for (let x = 20 - half; x < 20 + half; x += 1) {
                    if (g[y] && g[y][x] !== undefined) g[y][x] = o.pedColor;
                }
            }
        }
    }
    return freeze(g);
}

/**
 * Les sept badges, indexés par le code de l'énumération Prisma.
 *
 * Les CODES ne changent pas — BRONZE, SILVER, GOLD sont gravés dans un type
 * PostgreSQL et une valeur d'énumération ne se retire pas d'un ALTER TABLE.
 * Seuls les libellés bougent, et ils vivent dans le dictionnaire.
 */
export const BADGE_ART = {
    PARTICIPANT: cube({ edge: 'w' }),
    BRONZE: cube({ edge: 'w', left: 'o' }),
    SILVER: cube({ edge: 'w', left: 'o', right: 'o' }),
    GOLD: cube({ edge: 'w', left: 'o', right: 'o', top: 'o' }),
    PODIUM_3: cube({ edge: 'w', left: 'z', right: 'z', top: 'z', pedestal: 1, pedColor: 'z' }),
    PODIUM_2: cube({ edge: 'd', left: 'w', right: 'w', top: 'w', pedestal: 2, pedColor: 'w' }),
    // Sans champ de couleur. L'aplat bleu isolait le badge de la page au lieu de
    // le distinguer des autres : sur un mur de badges, c'était le seul à traîner
    // un rectangle derrière lui. L'or et les trois étages suffisent à dire qui
    // a gagné.
    PODIUM_1: cube({ edge: 'd', left: 'y', right: 'y', top: 'y', pedestal: 3, pedColor: 'y' }),
};

/* --------------------------------------------------------------------------
   Les bandes de profil
   -------------------------------------------------------------------------- */

const band = (paint) => { const g = blank(12, 64); paint(g); return freeze(g); };
const fill = (g, y0, y1, x0, x1, ch) => {
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) if (g[y] && g[y][x] !== undefined) g[y][x] = ch;
    }
};

// Douze pixels de large, soixante-quatre de haut, et le motif se répète
// verticalement : une bande doit se raccorder à elle-même, donc le haut et le
// bas de chaque dessin sont pensés pour se toucher sans couture visible.
export const BAND_ART = {
    faders: band((g) => {
        for (let i = 0; i < 8; i += 1) {
            const y = i * 8 + 1;
            const h = 2 + ((i * 5) % 5);
            fill(g, y, y + 6, 5, 6, 'd');
            fill(g, y + h, y + h + 1, 3, 8, 'g');
        }
    }),
    skyline: band((g) => {
        let y = 0; let i = 0;
        const hs = [4, 7, 3, 9, 5, 6];
        while (y < 64) { const h = hs[i % 6]; fill(g, y, y + h, 2, 9, 'd'); fill(g, y, y, 2, 9, 'c'); y += h + 2; i += 1; }
    }),
    film: band((g) => {
        fill(g, 0, 63, 1, 10, 'd');
        for (let y = 1; y < 64; y += 4) { fill(g, y, y + 1, 2, 3, 'k'); fill(g, y, y + 1, 8, 9, 'k'); }
        for (let y = 2; y < 64; y += 8) fill(g, y, y + 5, 4, 7, 'w');
    }),
    cable: band((g) => {
        for (let y = 0; y < 58; y += 1) { const x = 5 + Math.round(Math.sin(y / 5) * 3); fill(g, y, y, x, x + 1, 'w'); }
        fill(g, 58, 63, 3, 8, 'g');
    }),
    blocks: band((g) => {
        const cs = ['r', 'y', 'g', 'c', 'm', 'w'];
        for (let i = 0; i < 10; i += 1) { const y = i * 6 + 1; const x = 1 + ((i * 5) % 6); fill(g, y, y + 3, x, x + 3, cs[i % 6]); }
    }),
    curtain: band((g) => {
        for (let x = 0; x < 12; x += 3) { fill(g, 0, 63, x, x + 1, 'm'); fill(g, 0, 63, x + 2, x + 2, 'd'); }
        for (let y = 0; y < 64; y += 9) fill(g, y, y, 0, 11, 'k');
    }),
    vu: band((g) => {
        for (let y = 63; y > 4; y -= 3) { const c = y > 30 ? 'g' : y > 14 ? 'y' : 'r'; fill(g, y - 1, y, 2, 9, c); }
    }),
    flags: band((g) => {
        fill(g, 0, 63, 5, 6, 'w');
        const cs = ['r', 'y', 'g', 'c', 'm', 'w'];
        for (let i = 0; i < 8; i += 1) {
            const y = i * 8 + 2; const left = i % 2 === 0; const c = cs[i % 6];
            for (let k = 0; k < 4; k += 1) fill(g, y + k, y + k, left ? 1 + k : 7, left ? 4 : 10 - k, c);
        }
    }),
    tape: band((g) => {
        fill(g, 0, 63, 3, 8, 'd');
        for (let y = 0; y < 64; y += 2) fill(g, y, y, 3, 8, 'k');
        for (let y = 0; y < 64; y += 16) fill(g, y, y + 2, 1, 10, 'y');
    }),
    cities: band((g) => {
        const sets = [[3, 7, 4, 6], [5, 3, 8, 4], [6, 9, 3, 7]];
        const cs = ['c', 'm', 'r'];
        sets.forEach((set, i) => {
            const base = (i + 1) * 21 - 1;
            set.forEach((h, j) => fill(g, base - h, base, 1 + j * 3, 2 + j * 3, cs[i]));
            fill(g, base + 1, base + 1, 0, 11, 'd');
        });
    }),
};

/* --------------------------------------------------------------------------
   Les rendus
   -------------------------------------------------------------------------- */

/**
 * Grille vers SVG. Les pixels voisins de même couleur sont fusionnés en un seul
 * rectangle : un badge tombe de mille six cents nœuds à moins de deux cents,
 * ce qui change tout quand un profil en affiche une douzaine.
 */
export function gridToSvg(rows, scale = 3, { hex = false } = {}) {
    const table = hex ? HEX_COLOR : CSS_COLOR;
    const w = rows[0].length * scale;
    const h = rows.length * scale;
    let out = '';
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            if (ch === '.') { x += 1; continue; }
            let n = 1;
            while (row[x + n] === ch) n += 1;
            out += `<rect x="${x * scale}" y="${y * scale}" width="${n * scale}" height="${scale}" fill="${table[ch]}"/>`;
            x += n;
        }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${out}</svg>`;
}

/**
 * Grille vers `background-image`. Les couleurs sont figées en hexadécimal : une
 * image encodée dans une URL sort du document et n'a plus accès à ses
 * variables CSS.
 */
export function gridToDataUrl(rows, scale = 3) {
    const svg = gridToSvg(rows, scale, { hex: true });
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Le même dessin sur un canvas, pour la carte d'export. */
export function drawGrid(ctx, rows, x0, y0, scale = 3) {
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            if (ch === '.') { x += 1; continue; }
            let n = 1;
            while (row[x + n] === ch) n += 1;
            ctx.fillStyle = HEX_COLOR[ch];
            ctx.fillRect(x0 + x * scale, y0 + y * scale, n * scale, scale);
            x += n;
        }
    });
}