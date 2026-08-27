import { useMemo } from 'react';
import { itemById } from '../lib/cosmetics.js';
import { BADGE_ART, BAND_ART, gridToSvg, gridToDataUrl } from '../lib/pixels.js';

/**
 * Le rendu des cosmétiques.
 *
 * Chaque composant est SILENCIEUX quand rien n'est porté : il renvoie
 * exactement ce qu'affichait le site avant la boutique. C'est la condition pour
 * pouvoir remplacer les avatars partout d'un coup sans que la page change
 * d'aspect pour ceux qui n'ont rien acheté.
 */

/* ---------------------------------------------------------------------------
   Le pixel art
   --------------------------------------------------------------------------- */

/**
 * Une grille de pixels, injectée telle quelle.
 *
 * `dangerouslySetInnerHTML` sur du SVG fabriqué par nos soins et jamais par
 * l'utilisateur : les grilles sont des constantes de module, aucune donnée
 * extérieure n'y entre. L'alternative — un composant React par rectangle —
 * produisait deux cents éléments réconciliés à chaque rendu pour un dessin qui
 * ne change jamais.
 */
export function PixelArt({ rows, scale = 3, label }) {
    const html = useMemo(() => gridToSvg(rows, scale), [rows, scale]);
    return (
        <span
            className="cos-badge"
            role={label ? 'img' : 'presentation'}
            aria-label={label}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

/**
 * Un badge d'événement.
 *
 * Avec `onClick`, il devient un vrai bouton — focus au clavier, touche Entrée,
 * annonce vocale — et porte son intitulé en infobulle. Sans, ce n'est qu'un
 * dessin, et il ne prétend pas être autre chose : un élément qui a l'air
 * cliquable sans l'être est pire qu'un élément inerte.
 */
export function Badge({ code, scale = 2, label, onClick }) {
    const rows = BADGE_ART[code];
    if (!rows) return null;

    const art = <PixelArt rows={rows} scale={scale} label={onClick ? undefined : label} />;
    if (!onClick) return art;

    return (
        <button type="button" className="cos-badge-btn" data-label={label} onClick={onClick} title={label}>
            {art}
        </button>
    );
}

/* ---------------------------------------------------------------------------
   L'avatar
   --------------------------------------------------------------------------- */

/**
 * L'avatar, encadré s'il y a de quoi.
 *
 * `className` laisse passer les règles déjà écrites pour l'ancienne balise —
 * `avatar--link` par exemple, que mobile.css agrandit nommément dans la ligne
 * de service. Sans elle, encadrer l'avatar de l'en-tête le rapetissait sur
 * téléphone.
 */
export function FramedAvatar({ url, frameId, size = 'sm', alt = '', className = '' }) {
    if (!url) return null;
    const item = itemById(frameId);
    const frame = item && item.slot === 'frame' ? ` ${item.css}` : '';
    return (
        <span className={`cos-frame cos-frame--${size}${frame}${className ? ` ${className}` : ''}`}>
            <img src={url} alt={alt} />
        </span>
    );
}

/* ---------------------------------------------------------------------------
   Le pseudo
   --------------------------------------------------------------------------- */

/**
 * Le pseudo et son effet.
 *
 * Un `<span>` et non un wrapper qui remplacerait l'élément appelant : le pseudo
 * est tantôt dans un lien, tantôt dans un `<strong>`, tantôt dans un titre. On
 * habille le texte, on ne décide pas de ce qui l'entoure.
 */
export function Name({ children, fxId }) {
    const item = itemById(fxId);
    const fx = item && item.slot === 'nameFx' ? ` ${item.css}` : '';
    return <span className={`cos-name${fx}`}>{children}</span>;
}

/* ---------------------------------------------------------------------------
   Les bandes de profil
   --------------------------------------------------------------------------- */

/**
 * Le profil encadré de ses deux bandes.
 *
 * Quand rien n'est porté, on ne rend AUCUN conteneur supplémentaire : le profil
 * garde exactement le balisage qu'il avait, et la grille à trois colonnes
 * n'existe pas. Un fragment vide vaut mieux qu'une div qui ne sert à rien.
 */
export function Banded({ bandId, children }) {
    const item = itemById(bandId);
    const art = item && item.slot === 'band' ? BAND_ART[item.art] : null;
    const url = useMemo(() => (art ? gridToDataUrl(art, 4) : null), [art]);

    if (!url) return <>{children}</>;

    // Les bandes vivent dans les MARGES de la fenêtre, pas dans la largeur du
    // profil : le contenu n'est plus enveloppé du tout, elles se posent à côté.
    // C'est aussi pour ça qu'elles sortent avant les enfants — l'ordre du
    // document n'a plus d'importance pour deux éléments en position fixe.
    return (
        <>
            <div className="cos-band cos-band--left" style={{ backgroundImage: url }} aria-hidden="true" />
            <div className="cos-band cos-band--right" style={{ backgroundImage: url }} aria-hidden="true" />
            {children}
        </>
    );
}

/* ---------------------------------------------------------------------------
   Le tampon
   --------------------------------------------------------------------------- */

const STAMP_COLOR = {
    w: 'var(--w, #e8e8e8)', y: 'var(--y)', c: 'var(--c)', g: 'var(--g)',
    m: 'var(--m)', r: 'var(--r)', o: 'var(--o, #e8531c)',
};

/** Le libellé d'un tampon. La POSE sur le tableau viendra avec le lot suivant. */
export function Stamp({ stampId, lang = 'en' }) {
    const item = itemById(stampId);
    if (!item || item.slot !== 'stamp') return null;
    return (
        <span className="cos-stamp" style={{ color: STAMP_COLOR[item.color] ?? 'var(--w, #e8e8e8)' }}>
            {item.text[lang] ?? item.text.en}
        </span>
    );
}

/* ---------------------------------------------------------------------------
   L'aperçu de boutique
   --------------------------------------------------------------------------- */

/**
 * Ce qu'on montre dans la vitrine, selon l'emplacement.
 *
 * Un cadre se juge sur un vrai avatar, une bande sur sa hauteur, un skin sur un
 * bout de carte. Un aperçu générique ne dirait rien d'aucun des trois.
 */
export function Preview({ item, avatarUrl, lang = 'en' }) {
    const bandUrl = useMemo(
        () => (item.slot === 'band' && BAND_ART[item.art] ? gridToDataUrl(BAND_ART[item.art], 3) : null),
        [item]
    );

    if (item.slot === 'frame') {
        // En `lg` et non en `md` : un cadre de cinq pixels sur une vignette de
        // trois rem et demie ne se voit pas, et c'est précisément ce qu'on
        // demande à l'acheteur de juger.
        return avatarUrl ? (
            <FramedAvatar url={avatarUrl} frameId={item.id} size="lg" />
        ) : (
            <span className={`cos-frame cos-frame--lg ${item.css}`}>
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect width='1' height='1' fill='%23333'/%3E%3C/svg%3E" alt="" />
            </span>
        );
    }

    if (item.slot === 'nameFx') {
        return <span className={`cos-name ${item.css}`}>SEIZUMA</span>;
    }

    if (item.slot === 'band') {
        return (
            <span
                className="cos-band"
                style={{ backgroundImage: bandUrl, width: '2.25rem', height: '5.5rem', display: 'block' }}
            />
        );
    }

    if (item.slot === 'cardSkin') {
        // `colors` vaut null pour le rendu par défaut : on montre alors la
        // palette du site plutôt qu'un carré vide.
        const [bg, accent, text] = item.colors ?? ['var(--screen)', 'var(--y)', 'var(--c)'];
        return (
            <span className="shop-swatch" style={{ background: bg }}>
                <span className="shop-swatch__title" style={{ color: accent }}>GRAND BEATBOX BATTLE</span>
                <span className="shop-swatch__sub" style={{ color: text }}>SOLO · 36 POINTS</span>
            </span>
        );
    }

    if (item.slot === 'stamp') return <Stamp stampId={item.id} lang={lang} />;

    return null;
}