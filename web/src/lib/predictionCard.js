/**
 * L'export d'un pronostic en image.
 *
 * Tracé dans un canvas côté navigateur, pas photographié côté serveur. Un
 * navigateur sans tête rendrait la page au pixel près, mais ajouterait trois
 * cents mégaoctets à l'image Docker et une seconde de latence par export, pour
 * un résultat qui ressemblerait à une capture d'écran — or ce qu'on partage sur
 * une story n'est pas une capture d'écran, c'est une affiche.
 *
 * Le prix de ce choix : ce fichier redessine le pronostic, il ne réutilise pas
 * les composants React. Les deux rendus peuvent donc diverger si l'un évolue
 * sans l'autre. La parade est de garder la carte DÉLIBÉRÉMENT plus simple que
 * l'écran — le vainqueur, les qualifiés, le score — et de ne jamais y porter
 * l'arbre complet. Ce qui doit tenir sur un téléphone tenu à bout de bras se
 * lit en trois secondes, pas en trente.
 */

/** Les formats. Tailles réelles du fichier produit, pas de mise à l'échelle. */
export const FORMATS = {
    square: { id: 'square', w: 1080, h: 1080, rows: 8 },
    story: { id: 'story', w: 1080, h: 1920, rows: 12 },
    wide: { id: 'wide', w: 1600, h: 900, rows: 6 },
};

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const DEEPEST = ['FINAL', 'SMALL_FINAL', 'SEMI', 'QUARTER', 'ROUND_OF_16'];

/**
 * Charge les polices avant le tracé.
 *
 * Sans cette attente, le premier export sort en police système : le canvas ne
 * déclenche pas le chargement d'une police web, il se contente de ce qui est
 * déjà là. Le bug est invisible en développement — les polices sont en cache —
 * et systématique pour un visiteur qui exporte dans la foulée de son arrivée.
 */
export async function ensureFonts() {
    if (!document.fonts) return;
    await Promise.all([
        document.fonts.load('400 120px VT323'),
        document.fonts.load('400 32px "IBM Plex Mono"'),
        document.fonts.load('600 32px "IBM Plex Mono"'),
    ]);
    await document.fonts.ready;
}

/**
 * La palette, lue sur le document plutôt que recopiée ici.
 *
 * Le site a plusieurs thèmes ; une carte exportée doit ressembler à l'écran
 * depuis lequel on l'exporte. Recopier les couleurs en dur les figerait au
 * thème du jour où ce fichier a été écrit.
 */
export function readPalette(root = document.documentElement) {
    const css = getComputedStyle(root);
    const v = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
    return {
        screen: v('--screen', '#0b0b0b'),
        ink: v('--w', '#e8e8e8'),
        faint: v('--line', '#3a3a3a'),
        accent: v('--y', '#ffe400'),
        ok: v('--g', '#00d648'),
        cyan: v('--c', '#00e8e8'),
    };
}

/**
 * Ce que la carte raconte.
 *
 * Extrait du pronostic complet, et volontairement pauvre : le vainqueur
 * annoncé, la liste des qualifiés d'une phase de classement, et l'identité.
 * Tout le reste — les scores battle par battle, les tours intermédiaires — ne
 * survivrait pas à la réduction en vignette Instagram.
 */
export function buildCardModel(prediction, { t } = {}) {
    const byId = new Map(prediction.category.contenders.map((c) => [c.id, c]));
    const nameOf = (id) => byId.get(id)?.name ?? '—';

    // Le vainqueur : la finale si elle est pronostiquée, sinon le tour le plus
    // profond renseigné. Un pronostic déposé avant les demies a quand même
    // quelque chose à montrer.
    let winner = null;
    let winnerRound = null;
    for (const round of DEEPEST) {
        const battle = prediction.battles.find((b) => b.round === round && b.winnerId);
        if (battle) {
            winner = nameOf(battle.winnerId);
            winnerRound = round;
            break;
        }
    }

    // Les qualifiés : la dernière phase de classement que la personne a remplie.
    // « Dernière » et non « première » : c'est celle qui compte le plus, et la
    // seule dont la coupe soit encore incertaine au moment du partage.
    let qualified = [];
    let qualifiedLabel = null;
    for (const phase of [...prediction.category.phases].reverse()) {
        if (!RANKING_TYPES.includes(phase.type)) continue;
        const ranks = prediction.ranks
            .filter((r) => r.phaseId === phase.id)
            .sort((a, b) => a.rank - b.rank);
        if (ranks.length === 0) continue;

        const cut = phase.qualifierCount ?? ranks.length;
        qualified = ranks.map((r) => ({
            rank: r.rank,
            name: nameOf(r.contenderId),
            through: r.rank <= cut,
        }));
        qualifiedLabel = phase.name;
        break;
    }

    return {
        title: `${prediction.event.name} ${prediction.event.year}`,
        subtitle: prediction.category.name,
        author: prediction.user?.globalName ?? prediction.user?.username ?? '',
        label: prediction.label ?? null,
        winner,
        winnerRound,
        winnerLabel: winnerRound && t ? t(`bracket.round.${winnerRound}`) : winnerRound,
        qualified,
        qualifiedLabel,
        // Les points ne s'affichent qu'une fois le pronostic scoré : une carte
        // annonçant « 0 point » avant la compète se lirait comme un échec.
        points: prediction.scoredAt ? prediction.points : null,
    };
}

// --- Tracé ---------------------------------------------------------------------

/** Coupe un texte à la largeur disponible, avec une ellipse. */
function fit(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
        cut = cut.slice(0, -1);
    }
    return `${cut}…`;
}

/**
 * Dessine la carte.
 *
 * Une seule mise en page verticale pour les trois formats, avec une échelle
 * dérivée de la largeur. Trois mises en page distinctes auraient triplé la
 * surface à corriger au premier ajustement, pour un gain visuel que personne ne
 * remarque : ce qui change entre un carré et une story, c'est le nombre de
 * lignes qui tiennent, pas la composition.
 */
export function drawCard(canvas, model, format, palette) {
    const { w, h, rows } = format;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    const pad = Math.round(w * 0.075);
    const inner = w - pad * 2;
    // L'unité de mesure : tout est exprimé en fractions de la largeur, donc le
    // même code produit un carré lisible et une story lisible.
    const u = w / 1080;

    ctx.fillStyle = palette.screen;
    ctx.fillRect(0, 0, w, h);

    // Le cadre. Deux traits pleins, jamais d'arrondi : c'est la règle de tout le
    // site, et c'est ce qui rend la carte reconnaissable en vignette.
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(2, 4 * u);
    ctx.strokeRect(pad / 2, pad / 2, w - pad, h - pad);

    let y = pad + 40 * u;

    // --- En-tête
    ctx.textBaseline = 'top';
    ctx.fillStyle = palette.faint;
    ctx.font = `400 ${Math.round(26 * u)}px "IBM Plex Mono", monospace`;
    ctx.fillText('BEATBOXPREDICTIONS', pad, y);
    y += 44 * u;

    ctx.fillStyle = palette.accent;
    ctx.font = `400 ${Math.round(78 * u)}px VT323, monospace`;
    ctx.fillText(fit(ctx, model.title.toUpperCase(), inner), pad, y);
    y += 74 * u;

    ctx.fillStyle = palette.ink;
    ctx.font = `400 ${Math.round(34 * u)}px "IBM Plex Mono", monospace`;
    ctx.fillText(fit(ctx, model.subtitle.toUpperCase(), inner), pad, y);
    y += 62 * u;

    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = Math.max(1, 2 * u);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
    y += 44 * u;

    // --- Le vainqueur annoncé : le cœur de la carte, et le seul élément qu'on
    // lit à coup sûr sur une vignette de deux centimètres.
    if (model.winner) {
        ctx.fillStyle = palette.faint;
        ctx.font = `400 ${Math.round(24 * u)}px "IBM Plex Mono", monospace`;
        ctx.fillText((model.winnerLabel ?? '').toUpperCase(), pad, y);
        y += 36 * u;

        ctx.fillStyle = palette.ok;
        ctx.font = `400 ${Math.round(96 * u)}px VT323, monospace`;
        ctx.fillText(fit(ctx, model.winner.toUpperCase(), inner), pad, y);
        y += 106 * u;
    }

    // --- Les qualifiés
    if (model.qualified.length > 0) {
        ctx.fillStyle = palette.faint;
        ctx.font = `400 ${Math.round(24 * u)}px "IBM Plex Mono", monospace`;
        ctx.fillText((model.qualifiedLabel ?? '').toUpperCase(), pad, y);
        y += 42 * u;

        const lineH = 46 * u;
        // On coupe sur la place réellement disponible, pas sur un nombre décidé
        // à l'avance : un titre long mange une ligne, et une liste qui déborde du
        // cadre est pire qu'une liste courte.
        const room = Math.floor((h - pad - 120 * u - y) / lineH);
        const take = Math.max(0, Math.min(rows, room, model.qualified.length));

        for (const row of model.qualified.slice(0, take)) {
            ctx.fillStyle = row.through ? palette.accent : palette.faint;
            ctx.font = `400 ${Math.round(40 * u)}px VT323, monospace`;
            ctx.fillText(String(row.rank).padStart(2, '0'), pad, y);

            ctx.fillStyle = row.through ? palette.ink : palette.faint;
            ctx.font = `400 ${Math.round(30 * u)}px "IBM Plex Mono", monospace`;
            ctx.fillText(fit(ctx, row.name, inner - 70 * u), pad + 70 * u, y + 6 * u);
            y += lineH;
        }

        if (model.qualified.length > take) {
            ctx.fillStyle = palette.faint;
            ctx.font = `400 ${Math.round(24 * u)}px "IBM Plex Mono", monospace`;
            ctx.fillText(`+ ${model.qualified.length - take}`, pad, y + 4 * u);
        }
    }

    // --- Pied : l'auteur, ses points, l'adresse. Ancré au bas du cadre plutôt
    // qu'à la suite du contenu, pour que les trois formats se ressemblent.
    const footY = h - pad - 60 * u;

    ctx.strokeStyle = palette.faint;
    ctx.beginPath();
    ctx.moveTo(pad, footY - 24 * u);
    ctx.lineTo(w - pad, footY - 24 * u);
    ctx.stroke();

    ctx.fillStyle = palette.ink;
    ctx.font = `400 ${Math.round(32 * u)}px "IBM Plex Mono", monospace`;
    ctx.fillText(fit(ctx, model.author, inner * 0.6), pad, footY);

    ctx.textAlign = 'right';
    if (model.points != null) {
        ctx.fillStyle = palette.ok;
        ctx.font = `400 ${Math.round(52 * u)}px VT323, monospace`;
        ctx.fillText(`${model.points} PTS`, w - pad, footY - 10 * u);
    } else {
        ctx.fillStyle = palette.faint;
        ctx.font = `400 ${Math.round(26 * u)}px "IBM Plex Mono", monospace`;
        ctx.fillText('beatboxpredictions.com', w - pad, footY + 4 * u);
    }
    ctx.textAlign = 'left';

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