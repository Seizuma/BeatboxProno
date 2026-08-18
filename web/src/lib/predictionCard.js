/**
 * L'export d'un pronostic en image.
 *
 * Tracé dans un canvas côté navigateur, pas photographié côté serveur. Un
 * navigateur sans tête rendrait la page au pixel près, mais ajouterait trois
 * cents mégaoctets à l'image Docker et une seconde de latence par export.
 *
 * ─── Ce que la première version ratait ───────────────────────────────────────
 *
 * Elle ne montrait qu'un extrait : le vainqueur et les huit premiers qualifiés.
 * L'idée était de « rester lisible en vignette ». C'était une erreur de
 * jugement : on ne partage pas un pronostic pour en montrer le résumé, on le
 * partage pour montrer TOUT ce qu'on a annoncé — c'est là-dessus qu'on se fait
 * chambrer. Un export amputé ne sert à rien.
 *
 * Et sa mise en page était fausse : le pied était posé à une distance fixe du
 * bas pendant que le contenu coulait depuis le haut. Dès que le contenu
 * dépassait, les deux se chevauchaient. Le format large, le plus court en
 * hauteur, était illisible pour cette seule raison.
 *
 * ─── Comment celle-ci s'y prend ──────────────────────────────────────────────
 *
 * Le tracé se fait en deux temps. On construit d'abord une mise en page
 * complète en coordonnées LOGIQUES, sans rien dessiner : on connaît alors sa
 * largeur et sa hauteur exactes. On calcule ensuite le facteur d'échelle qui la
 * fait tenir dans le format demandé, et on dessine une seule fois à travers ce
 * facteur.
 *
 * Conséquence : plus rien ne peut déborder ni se chevaucher, quel que soit le
 * nombre de phases, de qualifiés ou de tours. Un pronostic à quarante
 * participants sort simplement plus petit qu'un pronostic à huit.
 *
 * La largeur logique elle-même est choisie par essais : on construit la mise en
 * page à plusieurs largeurs, et on garde celle dont le facteur d'échelle final
 * est le plus grand — c'est-à-dire la plus lisible. C'est ce qui fait qu'une
 * story prend une colonne et un format large en prend quatre, sans qu'aucune
 * règle ne le décide explicitement.
 */

export const FORMATS = {
    square: { id: 'square', w: 1080, h: 1080 },
    story: { id: 'story', w: 1080, h: 1920 },
    wide: { id: 'wide', w: 1920, h: 1080 },
};

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const ROUND_ORDER = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

/** Les largeurs logiques essayées. La meilleure gagne, aucune n'est privilégiée. */
const CANDIDATE_WIDTHS = [820, 1100, 1400, 1750, 2100, 2600, 3200];

/** Au-delà, le texte devient énorme sur un pronostic très court. */
const MAX_SCALE = 1.35;

/**
 * Le fichier est rendu au double des dimensions nominales.
 *
 * Un pronostic complet est dense : à 1080 px de large, le nom d'un beatboxer
 * fait une quinzaine de pixels. Doubler la définition ne change rien à la
 * proportion — donc rien à la lisibilité en vignette — mais rend le texte net
 * quand quelqu'un zoome, ce qu'on fait toujours devant un tableau. Les réseaux
 * rééchantillonnent de toute façon à leur guise.
 */
const PIXEL_SCALE = 2;

const DISPLAY = 'VT323, monospace';
const DATA = '"IBM Plex Mono", monospace';

/**
 * Charge les polices avant le tracé.
 *
 * Sans cette attente, le premier export sort en police système : le canvas ne
 * déclenche pas le chargement d'une police web, il se contente de ce qui est
 * déjà là. Le défaut est invisible en développement — tout est en cache — et
 * systématique pour quelqu'un qui exporte en arrivant sur le site.
 */
export async function ensureFonts() {
    if (!document.fonts) return;
    await Promise.all([
        document.fonts.load('400 120px VT323'),
        document.fonts.load('400 32px "IBM Plex Mono"'),
    ]);
    await document.fonts.ready;
}

/**
 * La palette, lue sur le document plutôt que recopiée ici.
 *
 * Le site a plusieurs thèmes ; une carte exportée doit ressembler à l'écran
 * depuis lequel on l'exporte.
 */
export function readPalette(root = document.documentElement) {
    const css = getComputedStyle(root);
    const v = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
    return {
        screen: v('--screen', '#0b0b0b'),
        ink: v('--w', '#e8e8e8'),
        faint: v('--line', '#3a3a3a'),
        dim: v('--ink-faint', '#8a8a8a'),
        accent: v('--y', '#ffe400'),
        ok: v('--g', '#00d648'),
        cyan: v('--c', '#00e8e8'),
    };
}

// --- Le modèle -------------------------------------------------------------------

/**
 * Le pronostic, en entier.
 *
 * Toutes les phases, dans l'ordre, avec tous leurs contenders et toutes leurs
 * affiches. Rien n'est écarté ici : c'est la mise en page qui se débrouille
 * pour tout faire tenir.
 */
export function buildCardModel(prediction, { t } = {}) {
    const label = (key, fallback) => (t ? t(key) : fallback);
    const byId = new Map(prediction.category.contenders.map((c) => [c.id, c]));
    const nameOf = (id) => byId.get(id)?.name ?? '—';

    const sections = [];

    for (const phase of prediction.category.phases) {
        if (RANKING_TYPES.includes(phase.type)) {
            const rows = prediction.ranks
                .filter((r) => r.phaseId === phase.id)
                .sort((a, b) => a.rank - b.rank)
                .map((r) => ({
                    rank: r.rank,
                    name: nameOf(r.contenderId),
                    // Sans nombre de qualifiés déclaré, personne n'est « barré » : mieux
                    // vaut ne rien affirmer que d'inventer une coupe.
                    through: phase.qualifierCount ? r.rank <= phase.qualifierCount : true,
                }));

            if (rows.length) {
                sections.push({
                    kind: 'ranking',
                    label: phase.name,
                    cut: phase.qualifierCount ?? null,
                    rows,
                });
            }
            continue;
        }

        // Phase à battles : on garde les tours dans l'ordre du tableau.
        const all = prediction.battles.filter(
            (b) => b.phaseId === phase.id && (b.winnerId || b.contenderAId || b.contenderBId)
        );
        if (all.length === 0) continue;

        const rounds = [];
        for (const round of ROUND_ORDER) {
            const list = all.filter((b) => b.round === round).sort((x, y) => x.slot - y.slot);
            if (list.length === 0) continue;
            rounds.push({
                round,
                label: label(`bracket.round.${round}`, round),
                battles: list.map((b) => ({
                    a: b.contenderAId ? nameOf(b.contenderAId) : null,
                    b: b.contenderBId ? nameOf(b.contenderBId) : null,
                    winnerIsA: b.winnerId && b.winnerId === b.contenderAId,
                    winnerIsB: b.winnerId && b.winnerId === b.contenderBId,
                    scoreA: b.scoreA,
                    scoreB: b.scoreB,
                })),
            });
        }

        if (rounds.length) sections.push({ kind: 'bracket', label: phase.name, rounds });
    }

    return {
        title: `${prediction.event.name} ${prediction.event.year}`,
        subtitle: prediction.category.name,
        author: prediction.user?.globalName ?? prediction.user?.username ?? '',
        // Les points ne s'affichent qu'une fois le pronostic scoré : une carte
        // annonçant « 0 point » avant la compète se lirait comme un échec.
        points: prediction.scoredAt ? prediction.points : null,
        sections,
    };
}

// --- La mise en page -------------------------------------------------------------
//
// Tout ce qui suit produit des OPÉRATIONS, pas des pixels. Une opération porte
// des coordonnées logiques ; le tracé final les traverse une fois, à l'échelle
// calculée. C'est ce découplage qui garantit qu'aucun bloc n'en chevauche un
// autre : les positions sont connues avant que quoi que ce soit soit dessiné.

const TITLE = 62;
const SUB = 30;
const EYEBROW = 22;
const SECTION = 26;
const ROW_H = 42;
const RANK_F = 34;
const NAME_F = 26;
const COL_MIN = 360;
const CARD_W_MIN = 300;
const SIDE_H = 40;
const CARD_GAP = 26;

const font = (ctx, size, family) => {
    ctx.font = `400 ${size}px ${family}`;
};

function fit(ctx, text, size, family, maxWidth) {
    font(ctx, size, family);
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
}

function layoutRanking(ctx, section, LW, top) {
    const ops = [];
    let y = top;

    ops.push({ t: 'text', x: 0, y, s: SECTION, f: DATA, c: 'dim', v: section.label.toUpperCase() });
    if (section.cut) {
        ops.push({
            t: 'text', x: LW, y, s: SECTION, f: DATA, c: 'dim', align: 'right',
            v: `TOP ${section.cut}`,
        });
    }
    y += SECTION + 18;

    // Le nombre de colonnes découle de la largeur disponible, pas d'un réglage :
    // c'est ce qui permet à la même liste de tenir sur une colonne en story et
    // sur quatre en format large.
    const cols = Math.max(1, Math.floor(LW / COL_MIN));
    const colW = LW / cols;
    const perCol = Math.ceil(section.rows.length / cols);

    section.rows.forEach((row, i) => {
        const col = Math.floor(i / perCol);
        const line = i % perCol;
        const x = col * colW;
        const ry = y + line * ROW_H;

        ops.push({
            t: 'text', x, y: ry, s: RANK_F, f: DISPLAY,
            c: row.through ? 'accent' : 'faint',
            v: String(row.rank).padStart(2, '0'),
        });
        ops.push({
            t: 'text', x: x + 62, y: ry + 5, s: NAME_F, f: DATA,
            c: row.through ? 'ink' : 'dim',
            v: fit(ctx, row.name, NAME_F, DATA, colW - 80),
        });
    });

    y += perCol * ROW_H + 16;
    return { ops, height: y - top };
}

/**
 * Un arbre de battles.
 *
 * Les tours occupent des colonnes de largeur égale, et chaque affiche se place
 * au milieu de la tranche verticale que ses deux affiches nourricières
 * occupent — c'est ce qui donne la pyramide, et c'est aussi ce qui permet de
 * tracer les liaisons sans les calculer séparément.
 */
function layoutBracket(ctx, section, LW, top) {
    const ops = [];
    let y = top;

    ops.push({ t: 'text', x: 0, y, s: SECTION, f: DATA, c: 'dim', v: section.label.toUpperCase() });
    y += SECTION + 18;

    const rounds = section.rounds;
    // La largeur nécessaire à l'arbre peut dépasser celle demandée : dans ce cas
    // c'est elle qui commande, et la mise en page entière s'élargit. Comprimer
    // les colonnes rendrait les noms illisibles, et c'est justement ce qu'on
    // cherche à éviter.
    const colW = Math.max(CARD_W_MIN + 40, LW / rounds.length);
    const width = colW * rounds.length;

    const cardH = SIDE_H * 2 + 6;
    const first = rounds[0].battles.length;
    const colH = Math.max(1, first) * (cardH + CARD_GAP);

    const titleY = y;
    y += SECTION + 12;
    const bodyTop = y;

    rounds.forEach((round, r) => {
        ops.push({
            t: 'text', x: r * colW, y: titleY, s: SECTION - 3, f: DATA, c: 'cyan',
            v: round.label.toUpperCase(),
        });

        const count = round.battles.length;
        const slice = colH / count;

        round.battles.forEach((battle, i) => {
            const cx = r * colW;
            const cy = bodyTop + i * slice + slice / 2 - cardH / 2;
            const cw = colW - 40;

            // Le cadre de l'affiche.
            ops.push({ t: 'rect', x: cx, y: cy, w: cw, h: cardH, c: 'faint' });

            const side = (name, isWinner, score, index) => {
                const sy = cy + index * SIDE_H;
                if (isWinner) {
                    // Le vainqueur en vidéo inverse, comme sur l'écran : c'est la seule
                    // marque qui survit à une forte réduction.
                    ops.push({ t: 'fill', x: cx + 1, y: sy + 1, w: cw - 2, h: SIDE_H - 2, c: 'accentFill' });
                }
                ops.push({
                    t: 'text', x: cx + 12, y: sy + 8, s: NAME_F - 2, f: DATA,
                    c: isWinner ? 'black' : name ? 'ink' : 'faint',
                    v: fit(ctx, name ?? '—', NAME_F - 2, DATA, cw - 70),
                });
                if (score != null) {
                    ops.push({
                        t: 'text', x: cx + cw - 12, y: sy + 8, s: NAME_F - 2, f: DATA, align: 'right',
                        c: isWinner ? 'black' : 'dim',
                        v: String(score),
                    });
                }
            };

            side(battle.a, battle.winnerIsA, battle.scoreA, 0);
            side(battle.b, battle.winnerIsB, battle.scoreB, 1);

            // La liaison vers le tour suivant. Tracée seulement quand le nombre
            // d'affiches est exactement divisé par deux : sur un tableau irrégulier —
            // une petite finale, une battle isolée — un trait inventerait un
            // enchaînement qui n'existe pas.
            const next = rounds[r + 1];
            if (next && next.battles.length * 2 === count) {
                const midY = cy + cardH / 2;
                const joinX = cx + cw + 20;
                ops.push({ t: 'line', x1: cx + cw, y1: midY, x2: joinX, y2: midY, c: 'faint' });

                if (i % 2 === 0) {
                    const partnerY = bodyTop + (i + 1) * slice + slice / 2;
                    ops.push({ t: 'line', x1: joinX, y1: midY, x2: joinX, y2: partnerY, c: 'faint' });
                }
            }
        });
    });

    y = bodyTop + colH + 10;
    return { ops, height: y - top, width };
}

/**
 * Construit la mise en page complète à une largeur logique donnée.
 *
 * Aucun pixel n'est dessiné ici : on ne produit que des positions. C'est ce qui
 * permet d'essayer plusieurs largeurs et de choisir la meilleure avant de
 * s'engager.
 */
function buildLayout(ctx, model, LW) {
    const ops = [];
    let y = 0;
    let width = LW;

    // --- En-tête
    ops.push({ t: 'text', x: 0, y, s: EYEBROW, f: DATA, c: 'dim', v: 'BEATBOXPREDICTIONS' });
    y += EYEBROW + 22;
    // Le titre n'est pas tronqué : c'est lui qu'on lit en premier. S'il dépasse,
    // c'est la mise en page entière qui s'élargit, et l'échelle finale s'ajuste.
    const titleText = model.title.toUpperCase();
    font(ctx, TITLE, DISPLAY);
    width = Math.max(width, Math.ceil(ctx.measureText(titleText).width));

    ops.push({ t: 'text', x: 0, y, s: TITLE, f: DISPLAY, c: 'accent', v: titleText });
    y += TITLE + 4;
    ops.push({ t: 'text', x: 0, y, s: SUB, f: DATA, c: 'ink', v: model.subtitle.toUpperCase() });
    y += SUB + 26;
    ops.push({ t: 'rule', y });
    y += 30;

    // --- Les phases, dans l'ordre
    for (const section of model.sections) {
        const laid =
            section.kind === 'ranking'
                ? layoutRanking(ctx, section, LW, y)
                : layoutBracket(ctx, section, LW, y);

        ops.push(...laid.ops);
        y += laid.height + 34;
        if (laid.width) width = Math.max(width, laid.width);
    }

    // --- Pied, DANS le flux et non collé au bas du cadre. C'est le défaut de la
    // version précédente : un pied à distance fixe du bas chevauchait le contenu
    // dès que celui-ci descendait trop.
    y += 6;
    ops.push({ t: 'rule', y });
    y += 24;
    ops.push({ t: 'text', x: 0, y, s: 30, f: DATA, c: 'ink', v: model.author });
    if (model.points != null) {
        ops.push({
            t: 'text', x: LW, y: y - 8, s: 46, f: DISPLAY, c: 'ok', align: 'right',
            v: `${model.points} PTS`,
        });
    } else {
        ops.push({
            t: 'text', x: LW, y, s: 26, f: DATA, c: 'dim', align: 'right',
            v: 'beatboxpredictions.com',
        });
    }
    y += 44;

    // Les opérations calées à droite l'ont été sur LW ; si une section a élargi la
    // mise en page, elles doivent suivre le bord réel.
    if (width !== LW) {
        for (const op of ops) {
            if (op.align === 'right' && op.x === LW) op.x = width;
            if (op.t === 'rule') op.w = width;
        }
    }

    return { ops, width, height: y };
}

/**
 * Dessine la carte.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} model    issu de buildCardModel
 * @param {object} format   une entrée de FORMATS
 * @param {object} palette  issu de readPalette
 */
export function drawCard(canvas, model, format, palette) {
    const w = format.w * PIXEL_SCALE;
    const h = format.h * PIXEL_SCALE;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.screen;
    ctx.fillRect(0, 0, w, h);

    const pad = Math.round(Math.min(w, h) * 0.055);
    const availW = w - pad * 2;
    const availH = h - pad * 2;

    // On construit la mise en page à plusieurs largeurs et on garde celle qui
    // autorise le plus grand facteur d'échelle. Aucune règle ne dit « une story
    // prend une colonne » : ça tombe tout seul, parce qu'une colonne y donne le
    // meilleur rapport.
    let best = null;
    for (const LW of CANDIDATE_WIDTHS) {
        const layout = buildLayout(ctx, model, LW);
        const scale = Math.min(availW / layout.width, availH / layout.height);
        if (!best || scale > best.scale) best = { layout, scale };
    }

    const scale = Math.min(best.scale, MAX_SCALE);
    const { layout } = best;

    // Centré dans le cadre : un contenu court ne doit pas paraître tombé en haut
    // à gauche d'une image vide.
    const offsetX = pad + (availW - layout.width * scale) / 2;
    const offsetY = pad + (availH - layout.height * scale) / 2;

    // Le cadre est tracé AVANT la transformation, pour garder une épaisseur
    // constante quel que soit le facteur d'échelle.
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
        accentFill: palette.accent,
        ok: palette.ok,
        cyan: palette.cyan,
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
                ctx.lineTo(op.w ?? layout.width, op.y);
                ctx.stroke();
                break;

            case 'line':
                ctx.strokeStyle = color(op.c);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(op.x1, op.y1);
                ctx.lineTo(op.x2, op.y2);
                ctx.stroke();
                break;

            case 'rect':
                ctx.strokeStyle = color(op.c);
                ctx.lineWidth = 2;
                ctx.strokeRect(op.x, op.y, op.w, op.h);
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
export function fileNameFor(model, format) {
    const slug = `${model.title} ${model.subtitle}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${slug}-${format.id}.png`;
}