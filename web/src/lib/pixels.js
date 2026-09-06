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

/* ---------------------------------------------------------------------------
   Le cube des badges a quitté ce fichier

   Les badges ne sont plus des dessins fixes : ce sont des cubes qui tournent,
   pré-calculés angle par angle. Leur géométrie vit dans `tools/gen-badges.mjs`,
   son résultat dans `lib/badgeSprites.js`.

   Ce fichier ne garde que le pixel art resté statique — les bandes de profil —
   et les fonctions qui transforment une grille en image.
   --------------------------------------------------------------------------- */

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
    /**
     * Les lianes.
     *
     * Une tige qui serpente sur toute la hauteur, avec des feuilles qui partent
     * alternativement à gauche et à droite. Le serpentement suit une sinusoïde
     * dont la période divise soixante-quatre : sans ça, le raccord entre le bas
     * et le haut de la bande ferait un décrochement visible à chaque répétition.
     */
    vines: band((g) => {
        for (let y = 0; y < 64; y += 1) {
            const x = 5 + Math.round(Math.sin((y / 64) * Math.PI * 4) * 3);
            fill(g, y, y, x, x + 1, 'g');

            // Une feuille tous les cinq pixels, du côté extérieur de la courbe.
            if (y % 5 === 0) {
                const droite = Math.cos((y / 64) * Math.PI * 4) > 0;
                const l = 2 + (y % 3);
                if (droite) fill(g, y, y + 1, x + 2, Math.min(11, x + 1 + l), 'g');
                else fill(g, y, y + 1, Math.max(0, x - l), x - 1, 'g');
            }
        }
    }),
    film: band((g) => {
        fill(g, 0, 63, 1, 10, 'd');
        for (let y = 1; y < 64; y += 4) { fill(g, y, y + 1, 2, 3, 'k'); fill(g, y, y + 1, 8, 9, 'k'); }
        for (let y = 2; y < 64; y += 8) fill(g, y, y + 5, 4, 7, 'w');
    }),
    /**
     * Le câble.
     *
     * L'embout était un rectangle vert de six pixels sur six : ça ne
     * ressemblait à rien de connu, et sur une bande qui se répète on le voyait
     * huit fois par écran. C'est maintenant une XLR mâle — le connecteur de
     * tous les micros, donc le seul embout qui a sa place à côté d'un site de
     * beatbox.
     *
     * Ce qui la rend reconnaissable n'est pas le corps mais les TROIS BROCHES
     * en triangle, deux en haut, une en bas. Tout le reste — manchon, loquet,
     * bague, coquille — n'est là que pour les porter et donner l'échelle.
     *
     * Le connecteur est écrit ligne par ligne plutôt qu'en `fill` : à ce niveau
     * de détail une suite d'appels ne se relit plus, alors qu'une grille se
     * corrige à l'œil.
     */
    cable: band((g) => {
        const HAUT = 44; // la ligne où commence le connecteur

        // La gaine. L'amplitude du serpentement retombe à zéro sur les huit
        // derniers pixels : un câble qui entrerait de biais dans un embout
        // rigide aurait l'air arraché, alors qu'un vrai câble se redresse dans
        // son manchon. C'est ce détail qui fait tenir l'ensemble.
        for (let y = 0; y < HAUT; y += 1) {
            const attenue = Math.min(1, (HAUT - y) / 8);
            const x = 5 + Math.round(Math.sin(y / 5) * 3 * attenue);
            fill(g, y, y, x, x + 1, 'w');
        }

        const XLR = [
            '....dwwd....', // manchon : la gaine entre dans le connecteur
            '...dwwwwd...',
            '..dwwwwwwd..', // corps
            '..dwwwwwwd..',
            '..dwwkkwwd..', // le loquet de verrouillage
            '..dwwwwwwd..',
            '..dwwwwwwd..',
            '..dddddddd..', // bague
            '.dwwwwwwwwd.', // coquille, plus large que le corps
            '.dwwwwwwwwd.',
            '.dwkkkkkkwd.',
            '.dwkkkkkkwd.',
            '.dwyykkyywd.', // les deux broches du haut
            '.dwyykkyywd.',
            '.dwkkkkkkwd.',
            '.dwkkyykkwd.', // la troisième, décalée : le triangle XLR
            '.dwkkyykkwd.',
            '.dwkkkkkkwd.',
            '.dwwwwwwwwd.',
            '..dddddddd..',
        ];

        XLR.forEach((ligne, i) => {
            [...ligne].forEach((ch, x) => {
                if (ch !== '.') g[HAUT + i][x] = ch;
            });
        });
    }),
    blocks: band((g) => {
        const cs = ['r', 'y', 'g', 'c', 'm', 'w'];
        for (let i = 0; i < 10; i += 1) { const y = i * 6 + 1; const x = 1 + ((i * 5) % 6); fill(g, y, y + 3, x, x + 3, cs[i % 6]); }
    }),
    /**
     * Le rideau de scène.
     *
     * Le magenta uni ne faisait pas un rideau : il faisait une bande rose. Un
     * tissu se lit à ses PLIS, c'est-à-dire à l'alternance de bandes verticales
     * éclairées et de creux sombres, de largeurs inégales — un pli régulier
     * ressemble à une palissade.
     *
     * Rouge pour la lumière, magenta pour le demi-ton, noir pour le creux :
     * trois valeurs, et le velours apparaît.
     */
    curtain: band((g) => {
        // Largeurs irrégulières, mais dont la somme divise douze pour que le
        // motif se raccorde d'un bord à l'autre de la bande.
        const plis = [[0, 2, 'r'], [2, 3, 'm'], [3, 4, 'k'], [4, 6, 'r'], [6, 7, 'm'],
                      [7, 8, 'k'], [8, 10, 'r'], [10, 11, 'm'], [11, 12, 'k']];
        for (const [x0, x1, c] of plis) fill(g, 0, 63, x0, x1 - 1, c);

        // Pas de bande horizontale : j'en avais mis pour figurer le drapé, elles
        // coupaient les plis net et ressemblaient à un défaut d'affichage. Un
        // rideau vu de près n'a que des lignes verticales.
        //
        // La tringle, en revanche, en haut : c'est elle qui dit que le tissu
        // pend au lieu de flotter.
        fill(g, 0, 1, 0, 11, 'd');
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
    /**
     * La texture manquante.
     *
     * Le damier violet et noir qu'affichent les moteurs de jeu quand ils ne
     * trouvent pas un fichier. C'est une blague d'atelier, et c'est aussi le
     * seul motif du catalogue que personne n'a besoin de faire expliquer.
     *
     * Carreaux de quatre pixels : à deux, le damier grouille sur une bande
     * étroite ; à huit, on n'en voit plus qu'un par écran.
     */
    missing: band((g) => {
        for (let y = 0; y < 64; y += 1) {
            for (let x = 0; x < 12; x += 1) {
                const carre = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
                g[y][x] = carre ? 'm' : 'k';
            }
        }
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