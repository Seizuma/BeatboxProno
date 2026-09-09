import fs from 'fs';
import { createCanvas } from 'canvas';

/**
 * La famille dessinée par cette exécution.
 *
 * Pour en produire une nouvelle : changer `SET`, ajuster les couleurs plus
 * haut, lancer le script, puis déclarer le module dans `web/src/lib/badgeSets.js`.
 * Chaque famille a son propre fichier — les écraser l'une l'autre reviendrait
 * à n'en avoir jamais qu'une.
 *
 * Rappel : ce script DESSINE. Il ne tourne qu'en local, jamais dans Docker et
 * jamais sur le VPS, dont l'image n'a pas ce qu'il lui faut.
 */
const SET = 'gbb';

/**
 * Les badges en rotation — deuxième version.
 *
 * ─── Ce qui n'allait pas ────────────────────────────────────────────────────
 *
 * La version précédente remplissait « les N premières faces visibles », triées
 * par profondeur. Comme l'ordre de profondeur change à chaque image, la face
 * pleine sautait d'un côté à l'autre du cube : c'est ce qui donnait cette
 * impression de téléportation. Ce n'était pas un cube tournant, c'était un cube
 * repeint à chaque image.
 *
 * Les faces pleines sont désormais DÉSIGNÉES sur le solide, une fois pour
 * toutes. Elles tournent avec lui, et disparaissent quand elles passent
 * derrière — ce qui est exactement le comportement d'un objet réel.
 */

const SIZE = 48;          // largeur de l'image
// Le cadre colle au cube. Les socles ont été retirés : ils ne distinguaient que
// trois badges sur sept, occupaient un tiers de la hauteur de l'image, et le
// rang se lit déjà à la couleur.
const HEIGHT = 44;
const FRAMES = 24;        // images pour un tour complet
const CUBE_H = 44;        // le cube occupe toute l'image
const TILT = 0.62;        // caméra au-dessus

const PAL = {
  y: '#ffe400',   // or
  o: '#e8531c',   // orange des paliers
  z: '#b06a2c',   // bronze
  // L'argent, et non le blanc d'avant. À #e8e8e8, la deuxième place se
  // confondait avec l'encre du site et avec la wildcard en fil de fer. Un gris
  // légèrement bleuté se lit comme un métal, pas comme une absence de couleur.
  a: '#b9bdc6',
  w: '#e8e8e8',   // encre, pour les arêtes
  d: '#3a3a3a',
  k: '#0b0b0b',
};

/* --- Géométrie ---------------------------------------------------------------- */

const V = [
  [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
  [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
];

/**
 * Les six faces, dans un ordre FIXE et nommé.
 *
 * C'est cet index que les paliers désignent. « La face avant » reste la face
 * avant du solide quel que soit l'angle — c'est toute la différence avec la
 * version précédente.
 */
const FACES = [
  { nom: 'dessus', idx: [0, 1, 2, 3], n: [0, -1, 0] },
  { nom: 'dessous', idx: [4, 7, 6, 5], n: [0, 1, 0] },
  { nom: 'gauche', idx: [0, 3, 7, 4], n: [-1, 0, 0] },
  { nom: 'droite', idx: [1, 5, 6, 2], n: [1, 0, 0] },
  { nom: 'arriere', idx: [0, 4, 5, 1], n: [0, 0, -1] },
  { nom: 'avant', idx: [3, 2, 6, 7], n: [0, 0, 1] },
];

const F = Object.fromEntries(FACES.map((f, i) => [f.nom, i]));
const TOUTES = [0, 1, 2, 3, 4, 5];

const LIGHT = (() => {
  const v = [-0.45, -0.82, 0.35];
  const m = Math.hypot(...v);
  return v.map((c) => c / m);
})();

const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

/* --- Trames ------------------------------------------------------------------- */

const LEVELS = [
  () => false,
  (x, y) => x % 2 === 0 && y % 2 === 0,
  (x, y) => (x + y) % 2 === 0,
  (x, y) => (x + y) % 4 !== 0,
  () => true,
];

/**
 * Plus d'éclairage par face.
 *
 * La version précédente faisait varier la densité de trame selon l'angle : la
 * face tournée vers la lumière devenait pleine, les autres tramées. C'est
 * correct physiquement et désagréable à l'œil — le cube semblait changer de
 * matière en tournant, et une face passait du plein au clairsemé sous le regard.
 *
 * Toutes les faces portent donc la MÊME densité. Le volume ne vient plus de
 * l'ombrage mais du mouvement lui-même : c'est la rotation qui dit que l'objet
 * a trois dimensions, l'ombrage n'avait plus rien à ajouter.
 */

/* --- Cadrage ------------------------------------------------------------------- */

const FIT = (() => {
  let m = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    const a = (i / FRAMES) * Math.PI * 2;
    for (const v of V) {
      const p = rotX(rotY(v, a), TILT);
      m = Math.max(m, Math.abs(p[0]), Math.abs(p[1]));
    }
  }
  return (CUBE_H / 2 - 2) / m;
})();

/**
 * Les entailles.
 *
 * Deux traits obliques par face, tracés en couleur de fond : ce sont eux qui
 * donnent au cube son air scindé, et c'est le motif que porte le badge actuel.
 * Ils sont définis dans le repère LOCAL de la face — deux coordonnées entre 0
 * et 1 — puis projetés avec elle. Ils tournent donc avec le solide au lieu
 * d'être plaqués sur l'image.
 */
const ENTAILLES = [
    // UNE seule par face, et bien rentrée dans ses bords. À deux, les six traits
    // des trois faces visibles se rejoignaient au niveau des arêtes et le cube
    // paraissait mité plutôt que scindé. Le badge actuel n'en a qu'une par face
    // lui aussi ; c'est le bon compte.
    [[0.26, 0.70], [0.70, 0.28]],
];

/** Un point du quadrilatère, en coordonnées locales. */
const surFace = (q, u, v) => ({
    x: (1 - u) * (1 - v) * q[0].x + u * (1 - v) * q[1].x + u * v * q[2].x + (1 - u) * v * q[3].x,
    y: (1 - u) * (1 - v) * q[0].y + u * (1 - v) * q[1].y + u * v * q[2].y + (1 - u) * v * q[3].y,
});

const inside = (px, py, pl) => {
  let hit = false;
  for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
    const [xi, yi] = pl[i], [xj, yj] = pl[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

function segment(g, p0, p1, colour) {
  let x0 = Math.round(p0.x), y0 = Math.round(p0.y);
  const x1 = Math.round(p1.x), y1 = Math.round(p1.y);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (g[y0] && g[y0][x0] !== undefined) g[y0][x0] = colour;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/* --- Les socles ont disparu -----------------------------------------------
   Ils ne distinguaient que trois badges sur sept, et le rang se lit déjà à la
   couleur : bronze, argent, or. Les retirer rend un tiers de la hauteur de
   l'image au cube, qui gagne d'autant en présence sur un mur de badges.
   -------------------------------------------------------------------------- */

/* --- Une image ------------------------------------------------------------------ */

/**
 * @param spec.colour  la couleur des faces pleines
 * @param spec.solid   les INDEX des faces pleines, sur le solide. Elles tournent
 *   avec lui et disparaissent quand elles passent derrière.
 */
function frame(angle, spec) {
  const g = Array.from({ length: HEIGHT }, () => Array(SIZE).fill('.'));
  const cx = SIZE / 2;
  const cy = CUBE_H / 2;

  const proj = V.map((v) => {
    const p = rotX(rotY(v, angle), TILT);
    return { x: cx + p[0] * FIT, y: cy + p[1] * FIT, z: p[2] };
  });

  const visibles = FACES
    .map((f, i) => {
      const n = rotX(rotY(f.n, angle), TILT);
      return { ...f, i, n, depth: f.idx.reduce((s, k) => s + proj[k].z, 0) / 4 };
    })
    .filter((f) => f.n[2] < 0)
    .sort((a, b) => b.depth - a.depth);

  // Les faces pleines, de la plus lointaine à la plus proche. Une face pleine
  // qui n'est pas visible n'est simplement pas dessinée : c'est ce qui fait
  // qu'un badge à une seule face devient un fil de fer quand elle passe derrière.
  for (const f of visibles) {
    if (!spec.solid.includes(f.i)) continue;
    const q = f.idx.map((k) => proj[k]);
    const pl = q.map((p) => [p.x, p.y]);

    // Plein et uniforme : aucune face n'est plus claire qu'une autre.
    for (let y = 0; y < CUBE_H; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (inside(x + 0.5, y + 0.5, pl)) g[y][x] = spec.colour;
      }
    }

    // Puis les entailles, en couleur de fond, tracées deux pixels de large :
    // à un seul, elles disparaissent dès que la face se présente de biais.
    for (const [a, b] of ENTAILLES) {
      const p0 = surFace(q, a[0], a[1]);
      const p1 = surFace(q, b[0], b[1]);
      segment(g, p0, p1, '.');
      segment(g, { x: p0.x + 1, y: p0.y }, { x: p1.x + 1, y: p1.y }, '.');
    }
  }

  // Les arêtes visibles, sans doublon.
  const vues = new Set();
  for (const f of visibles) {
    for (let i = 0; i < 4; i += 1) {
      const a = f.idx[i], b = f.idx[(i + 1) % 4];
      const cle = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      segment(g, proj[a], proj[b], spec.edge ?? 'w');
    }
  }

  return g;
}

/* --- Les sept badges ------------------------------------------------------------- */

/**
 * Le palier se lit au nombre de faces pleines, comme aujourd'hui — mais ce sont
 * des faces DÉSIGNÉES du solide, pas « les premières visibles ».
 *
 * Avant et droite pour le premier palier : ce sont les deux faces qu'on voit
 * ensemble à l'angle de départ, donc celles qui se remarquent d'abord.
 */
/**
 * Le dessus est TOUJOURS plein sur les paliers bas.
 *
 * La caméra regarde d'au-dessus : la face du dessus ne passe jamais derrière.
 * En la remplissant, on garantit qu'un Top 60 % ne se réduit jamais à un fil de
 * fer — c'est ce qui le rendait indiscernable de la wildcard sur un tiers des
 * images, et c'est le défaut qu'on corrige ici.
 *
 * Le palier se lit donc au nombre de faces LATÉRALES pleines : aucune, une,
 * deux, toutes. Le dessus ne compte pas, il sert de socle de lecture.
 */
const SERIE = [
  ['PARTICIPANT', 'Wildcard', { colour: 'w', solid: [], edge: 'w' }],
  ['BRONZE', 'Top 60 %', { colour: 'o', solid: [F.dessus, F.avant], edge: 'w' }],
  ['SILVER', 'Top 30 %', { colour: 'o', solid: [F.dessus, F.avant, F.droite], edge: 'w' }],
  ['GOLD', 'Top 5 %', { colour: 'o', solid: TOUTES, edge: 'w' }],
  ['PODIUM_3', '3e', { colour: 'z', solid: TOUTES, edge: 'd' }],
  ['PODIUM_2', '2e', { colour: 'a', solid: TOUTES, edge: 'd' }],
  ['PODIUM_1', '1er', { colour: 'y', solid: TOUTES, edge: 'd' }],
];

/* --- Sortie : un module JavaScript ------------------------------------------- */

/**
 * Pourquoi un fichier ENGENDRÉ et pas un calcul à l'exécution.
 *
 * Rastériser sept badges sur vingt-quatre angles demande huit cents
 * millisecondes sur une machine de bureau — trois à cinq fois plus sur un
 * téléphone. Le faire au chargement de la page gèlerait l'écran le temps que la
 * décoration s'affiche, ce qui est le pire échange possible.
 *
 * Le calcul se fait donc ici, une fois, et son résultat est commité. Pour le
 * refaire après avoir touché à la géométrie :
 *
 *     npm i -D canvas
 *     node tools/gen-badges.mjs
 *
 * Le fichier produit est illisible — c'est du PNG encodé — et c'est normal :
 * il ne se relit pas, il se régénère.
 */

const sheets = SERIE.map(([code, label, spec]) => {
    const frames = Array.from({ length: FRAMES }, (_, i) =>
        frame((Math.PI / FRAMES) + (i / FRAMES) * Math.PI * 2, spec));
    const c = createCanvas(FRAMES * SIZE, HEIGHT);
    const ctx = c.getContext('2d');
    frames.forEach((g, f) => g.forEach((row, y) => row.forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = PAL[ch];
        ctx.fillRect(f * SIZE + x, y, 1, 1);
    })));
    const png = c.toBuffer('image/png');
    return { code, label, base64: png.toString('base64'), bytes: png.length };
});

const out = `/**
 * Les badges en rotation — bandes d'images ENGENDRÉES.
 *
 * ⚠ Fichier produit par \`tools/gen-badges.mjs\`. Ne pas modifier à la main :
 * la prochaine génération l'écrasera. Pour changer la géométrie, la vitesse ou
 * le nombre d'angles, c'est le générateur qu'il faut toucher.
 *
 * Chaque badge est une bande de ${FRAMES} images côte à côte, en PNG encodé dans
 * le fichier. Le navigateur n'a plus qu'à déplacer une position de fond par
 * crans : une animation CSS, aucun JavaScript à l'exécution, aucune requête
 * réseau, et rien à recalculer même avec sept badges à l'écran.
 *
 * En SVG, la même chose pèserait plus de quatre cents kilo-octets par badge :
 * les entailles et les arêtes obliques n'ont presque aucun pixel voisin de même
 * couleur, donc rien à regrouper. C'est la mesure qui a tranché le format.
 */

/**
 * L'identifiant de la famille.
 *
 * Il préfixe toutes les classes CSS. Sans lui, deux familles se marcheraient
 * dessus : le code \`GOLD\` existe dans chacune, et la dernière feuille posée
 * gagnerait. Le registre \`badgeSets.js\` s'en sert pour retrouver le module.
 */
export const SET_ID = '${SET}';

/** Images par tour. */
export const FRAMES = ${FRAMES};

/** Dimensions d'une image, en pixels de dessin. */
export const SPRITE_W = ${SIZE};
export const SPRITE_H = ${HEIGHT};

/**
 * Les tailles proposées, en multiples ENTIERS du dessin.
 *
 * Un multiple fractionnaire ferait rééchantillonner le navigateur et le pixel
 * cesserait d'être un pixel — le même écueil que les cadres d'avatar.
 */
export const SCALES = [1, 2, 3];

/** Durée d'un tour. Six secondes : assez lent pour suivre une face du regard. */
export const SPIN_SECONDS = 6;

const SPRITES = {
${sheets.map((s2) => `    ${s2.code}: '${s2.base64}',`).join('\n')}
};

/**
 * La feuille de styles des badges.
 *
 * Engendrée depuis les bandes plutôt qu'écrite à la main : ajouter un badge, ou
 * en changer la vitesse, ne demande alors de toucher qu'un seul endroit.
 */
export function badgeStylesheet() {
    const out = [];

    out.push(
        \`.cos-badge3d{display:inline-block;background-repeat:no-repeat;\` +
        \`image-rendering:pixelated;animation-duration:\${SPIN_SECONDS}s;\` +
        \`animation-timing-function:steps(\${FRAMES});animation-iteration-count:infinite}\`
    );

    for (const k of SCALES) {
        out.push(
            \`.cos-badge3d--x\${k}{width:\${SPRITE_W * k}px;height:\${SPRITE_H * k}px;\` +
            \`background-size:\${FRAMES * SPRITE_W * k}px \${SPRITE_H * k}px;\` +
            \`animation-name:cos-badge-x\${k}}\`
        );
        out.push(\`@keyframes cos-badge-x\${k}{to{background-position-x:-\${FRAMES * SPRITE_W * k}px}}\`);
    }

    // Les départs décalés : sept badges qui tournent à l'unisson font une
    // horloge, pas une collection.
    Object.entries(SPRITES).forEach(([code, data], i) => {
        out.push(
            \`.cos-badge3d--\${SET_ID}-\${code}{background-image:url("data:image/png;base64,\${data}");\` +
            \`animation-delay:\${(-i * 0.9).toFixed(2)}s}\`
        );
    });

    /**
     * Sur écran étroit, chaque taille descend d'un cran.
     *
     * Trois badges en x2 font 288 pixels, plus leurs écarts : ils débordaient
     * d'un panneau qui n'en offre que 290 sur un téléphone. Et une modale qui
     * déborde emmène toute la page, parce que le document s'élargit et que le
     * navigateur dézoome — c'est ce qui rendait le profil entier illisible.
     *
     * La classe garde son nom : c'est une adaptation d'encombrement, pas un
     * changement de taille demandé par l'appelant, et le composant n'a pas à
     * connaître la largeur de l'écran pour choisir sa classe.
     */
    const petit = [];
    for (const k of SCALES) {
        if (k === 1) continue;
        const j = k - 1;
        petit.push(
            \`.cos-badge3d--x\${k}{width:\${SPRITE_W * j}px;height:\${SPRITE_H * j}px;\` +
            \`background-size:\${FRAMES * SPRITE_W * j}px \${SPRITE_H * j}px;\` +
            \`animation-name:cos-badge-x\${j}}\`
        );
    }
    out.push(\`@media (max-width:560px){\${petit.join('')}}\`);

    // Sans animation, c'est la première image qui reste : un cube de trois
    // quarts, parfaitement lisible. Rien à prévoir de plus.
    out.push('@media (prefers-reduced-motion:reduce){.cos-badge3d{animation:none}}');

    return out.join('\\n');
}

/** Pose la feuille dans le document, une seule fois. */
export function installBadges() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(\`cos-badges-\${SET_ID}\`)) return;
    const style = document.createElement('style');
    style.id = \`cos-badges-\${SET_ID}\`;
    style.textContent = badgeStylesheet();
    document.head.appendChild(style);
}

/** Les codes disponibles, pour qu'un appelant puisse vérifier avant d'afficher. */
export const BADGE_CODES = Object.keys(SPRITES);
`;

/**
 * La destination, calculée depuis l'emplacement du SCRIPT et non depuis le
 * répertoire courant.
 *
 * `import.meta.url` rend la commande insensible à l'endroit d'où on l'appelle —
 * depuis `tools/`, depuis la racine, depuis n'importe où. Un chemin relatif au
 * répertoire courant aurait produit le classique « ça marche chez moi », suivi
 * d'un fichier écrit au mauvais endroit sans que rien ne le signale.
 */
const cible = new URL(
  SET === 'gbb'
    // La famille d'origine garde son nom de fichier : le renommer casserait
    // les imports pour rien.
    ? '../web/src/lib/badgeSprites.js'
    : `../web/src/lib/badgeSprites.${SET}.js`,
  import.meta.url
);

// CRLF, comme le reste du dépôt : sans ça, chaque génération ferait apparaître
// le fichier entier comme modifié dans git.
fs.writeFileSync(cible, out.replace(/\n/g, '\r\n'));

console.log('écrit dans', cible.pathname);
console.log('poids du module :', Math.round(out.length / 1024), 'ko');
for (const s2 of sheets) console.log('  ', s2.code.padEnd(12), Math.round(s2.bytes / 1024 * 10) / 10, 'ko');
console.log('\nRelisez le diff : 40 ko de base64 qui changent, c\'est normal.');
