import { EXPORT_PIXEL_SCALE, ensureFonts, readPalette } from './predictionCard.js';

/**
 * L'affiche d'annonce : « les pronostics sont ouverts ».
 *
 * ─── Ce qu'elle réutilise ────────────────────────────────────────────────────
 *
 * Le chargement des polices, la lecture de la palette et la définition du
 * fichier viennent de `predictionCard.js`. Ce sont exactement les mêmes
 * problèmes — le canvas ne déclenche pas le chargement d'une police web, la
 * carte doit suivre le thème, l'image doit rester nette au zoom — et les avoir
 * résolus deux fois aurait garanti que la seconde copie prenne du retard.
 *
 * Ce module ne fournit donc que la mise en page.
 *
 * ─── Ce qu'elle annonce, et ce qu'elle tait ──────────────────────────────────
 *
 * Une story se regarde trois secondes, le pouce déjà en mouvement. Elle porte
 * ce qui décide d'agir : la compétition, la date, les catégories ouvertes, la
 * date butoir, l'adresse du site. Pas la liste des participants, pas le
 * règlement, pas les seeds — tout cela est à un clic, et le rôle de l'affiche
 * est de faire faire ce clic.
 *
 * La date butoir est le seul élément mis en couleur d'alerte : c'est elle qui
 * transforme « intéressant » en « maintenant ».
 */

export const FORMATS = {
  story: { id: 'story', w: 1080, h: 1920 },
  square: { id: 'square', w: 1080, h: 1080 },
};

const DISPLAY = 'VT323, monospace';
const DATA = '"IBM Plex Mono", monospace';

/** Au-delà, le texte devient énorme sur une affiche très courte. */
const MAX_SCALE = 1.6;

export { ensureFonts, readPalette };

/**
 * Ce que l'affiche raconte, extrait de l'événement.
 *
 * Les catégories portent leur nombre d'inscrits : « SOLO — 20 » dit plus que
 * « SOLO », et c'est l'information qui fait mesurer l'ampleur du plateau.
 */
export function buildEventCard(event, { locale = 'fr-FR' } = {}) {
  const day = (value, opts) =>
    value ? new Date(value).toLocaleDateString(locale, opts ?? { day: 'numeric', month: 'long' }) : null;

  const start = day(event.startsAt);
  const end = day(event.endsAt);
  const dates = start && end && start !== end ? `${start} — ${end}` : start;

  return {
    title: `${event.name} ${event.year}`,
    location: event.location ?? null,
    dates,
    categories: (event.categories ?? []).map((c) => ({
      name: c.name,
      contenders: c.contenders?.length ?? 0,
    })),
    // Sans date butoir déclarée, on n'invente rien : le cas « wildcards
    // ouvertes, date de la compète encore inconnue » est fréquent.
    deadline: event.predictionsCloseAt
      ? new Date(event.predictionsCloseAt).toLocaleString(locale, {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
      : null,
  };
}

// --- Mise en page ---------------------------------------------------------------
//
// Même méthode que la carte de pronostic : on construit des OPÉRATIONS en
// coordonnées logiques, on mesure, puis on met à l'échelle une seule fois. Rien
// ne peut alors déborder, quel que soit le nombre de catégories ou la longueur
// du nom.

const font = (ctx, size, family) => {
  ctx.font = `400 ${size}px ${family}`;
};

function wrap(ctx, text, size, family, maxWidth) {
  font(ctx, size, family);
  const words = String(text).split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const LW = 900;

function buildLayout(ctx, card) {
  const ops = [];
  let y = 0;

  // --- Le bandeau d'annonce, en vidéo inverse : c'est ce qu'on lit en premier
  // et de loin, avant même le nom de la compétition.
  const banner = 'PRONOSTICS OUVERTS';
  font(ctx, 40, DATA);
  const bw = ctx.measureText(banner).width + 40;
  ops.push({ t: 'fill', x: 0, y, w: bw, h: 58, c: 'accent' });
  ops.push({ t: 'text', x: 20, y: y + 10, s: 40, f: DATA, c: 'black', v: banner });
  y += 58 + 46;

  // --- Le nom, sur autant de lignes qu'il en faut. Jamais tronqué : c'est le
  // seul mot qui compte si on ne lit que lui.
  for (const line of wrap(ctx, card.title.toUpperCase(), 96, DISPLAY, LW)) {
    ops.push({ t: 'text', x: 0, y, s: 96, f: DISPLAY, c: 'accent', v: line });
    y += 92;
  }
  y += 16;

  if (card.location) {
    ops.push({ t: 'text', x: 0, y, s: 34, f: DATA, c: 'ink', v: card.location.toUpperCase() });
    y += 46;
  }
  if (card.dates) {
    ops.push({ t: 'text', x: 0, y, s: 34, f: DATA, c: 'dim', v: card.dates.toUpperCase() });
    y += 46;
  }

  y += 22;
  ops.push({ t: 'rule', y });
  y += 40;

  // --- Les catégories ouvertes, avec leur plateau
  if (card.categories.length) {
    ops.push({ t: 'text', x: 0, y, s: 26, f: DATA, c: 'dim', v: 'CATÉGORIES' });
    y += 44;

    for (const category of card.categories) {
      ops.push({ t: 'text', x: 0, y, s: 46, f: DISPLAY, c: 'ok', v: category.name.toUpperCase() });
      if (category.contenders > 0) {
        ops.push({
          t: 'text', x: LW, y: y + 8, s: 28, f: DATA, c: 'dim', align: 'right',
          v: `${category.contenders} inscrits`,
        });
      }
      y += 58;
    }
    y += 20;
  }

  // --- La date butoir : le seul élément en couleur d'alerte. C'est elle qui
  // transforme « intéressant » en « maintenant ».
  if (card.deadline) {
    ops.push({ t: 'rule', y });
    y += 36;
    ops.push({ t: 'text', x: 0, y, s: 26, f: DATA, c: 'dim', v: 'FERMETURE DES PRONOSTICS' });
    y += 40;
    ops.push({ t: 'text', x: 0, y, s: 52, f: DISPLAY, c: 'alert', v: card.deadline.toUpperCase() });
    y += 66;
  }

  y += 26;
  ops.push({ t: 'rule', y });
  y += 30;
  ops.push({ t: 'text', x: 0, y, s: 40, f: DATA, c: 'cyan', v: 'beatboxpredictions.com' });
  y += 52;

  return { ops, width: LW, height: y };
}

/**
 * Dessine l'affiche.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} card      issu de buildEventCard
 * @param {object} format    une entrée de FORMATS
 * @param {object} palette   issu de readPalette
 * @param {number} pixelScale  définition du rendu, en multiples du format
 *                             nominal. Voir `predictionCard.js` : l'aperçu se
 *                             dessine à la densité de son affichage, le fichier
 *                             au double du format.
 */
export function drawEventCard(canvas, card, format, palette, { pixelScale = EXPORT_PIXEL_SCALE } = {}) {
  const w = Math.round(format.w * pixelScale);
  const h = Math.round(format.h * pixelScale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.screen;
  ctx.fillRect(0, 0, w, h);

  const pad = Math.round(Math.min(w, h) * 0.08);
  const availW = w - pad * 2;
  const availH = h - pad * 2;

  const layout = buildLayout(ctx, card);
  const scale = Math.min(MAX_SCALE, availW / layout.width, availH / layout.height);

  // Centré verticalement : une story très courte ne doit pas paraître tombée
  // en haut d'une image vide.
  const offsetX = pad;
  const offsetY = pad + Math.max(0, (availH - layout.height * scale) / 2);

  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(2, Math.round(w * 0.004));
  ctx.strokeRect(pad / 2, pad / 2, w - pad, h - pad);

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  ctx.textBaseline = 'top';

  const color = (key) =>
    ({
      ink: palette.ink,
      dim: palette.dim,
      faint: palette.faint,
      accent: palette.accent,
      ok: palette.ok,
      cyan: palette.cyan,
      alert: palette.magenta,
      black: '#000',
    }[key] ?? palette.ink);

  for (const op of layout.ops) {
    switch (op.t) {
      case 'text':
        ctx.fillStyle = color(op.c);
        font(ctx, op.s, op.f);
        ctx.textAlign = op.align === 'right' ? 'right' : 'left';
        ctx.fillText(op.v, op.x, op.y);
        ctx.textAlign = 'left';
        break;

      case 'rule':
        ctx.strokeStyle = color('faint');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, op.y);
        ctx.lineTo(layout.width, op.y);
        ctx.stroke();
        break;

      case 'fill':
        ctx.fillStyle = color(op.c);
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;

      default:
        break;
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** Le nom du fichier produit. Sans espaces : certains clients les mutilent. */
export function eventFileName(card, format) {
  const slug = card.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}-ouverture-${format.id}.png`;
}