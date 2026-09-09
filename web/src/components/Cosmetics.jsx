import { useMemo } from 'react';
import { itemById } from '../lib/cosmetics.js';
import { BAND_ART, gridToSvg, gridToDataUrl } from '../lib/pixels.js';
import { SCALES } from '../lib/badgeSprites.js';
import { hasBadge } from '../lib/badgeSets.js';

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
/**
 * Un badge d'événement.
 *
 * Ce n'est plus un dessin fixe mais une bande d'images : vingt-quatre angles
 * pré-calculés que le navigateur fait défiler par crans. Il n'y a donc rien à
 * rendre — juste une boîte de la bonne taille portant la bonne classe.
 *
 * `scale` reste l'API d'avant, en multiples ENTIERS du dessin : un multiple
 * fractionnaire ferait rééchantillonner le navigateur.
 *
 * `set` désigne la FAMILLE de dessins, celle que la compète a choisie. Sans
 * elle, toutes les compètes affichaient les mêmes cubes — ceux du Grand Beatbox
 * Battle — y compris celles qui n'avaient rien à voir. Une famille inconnue, ou
 * qui ne dessine pas ce code, ne rend rien plutôt qu'une case vide.
 */
export function Badge({ code, set, scale = 2, label, onClick }) {
    if (!hasBadge(set, code)) return null;

    const k = SCALES.includes(scale) ? scale : 2;
    const art = (
        <span
            className={`cos-badge3d cos-badge3d--x${k} cos-badge3d--${set}-${code}`}
            role={onClick ? undefined : 'img'}
            aria-label={onClick ? undefined : label}
        />
    );

    if (!onClick) return art;

    return (
        <button
            type="button"
            className="cos-badge-btn"
            data-label={label}
            aria-label={label}
            onClick={onClick}
        >
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
/** L'URL du motif d'une bande, pour qui veut la peindre lui-même. */
export function bandImage(bandId) {
    const item = itemById(bandId);
    const art = item && item.slot === 'band' ? BAND_ART[item.art] : null;
    return art ? gridToDataUrl(art, 4) : null;
}

export function Banded({ bandId, children, inline = false }) {
    const item = itemById(bandId);
    const art = item && item.slot === 'band' ? BAND_ART[item.art] : null;
    const url = useMemo(() => (art ? gridToDataUrl(art, 4) : null), [art]);

    if (!url) return <>{children}</>;

    // `inline` : les bandes se posent aux bords du CONTENEUR et non de la
    // fenêtre. C'est le mode de l'aperçu de boutique, où le profil s'affiche
    // dans une fenêtre modale — des bandes en position fixe iraient se coller
    // aux bords de l'écran, derrière le voile, invisibles.
    if (inline) {
        return (
            <div className="cos-banded-inline">
                {/* Une classe DISTINCTE, et non `cos-band` redéclarée : celle-ci
                    est en position fixe, et il suffisait qu'elle l'emporte pour
                    que les bandes se collent aux bords de la FENÊTRE, donc
                    par-dessus l'en-tête et le pied de la modale. */}
                <div className="cos-band-inline cos-band-inline--left" style={{ backgroundImage: url }} aria-hidden="true" />
                <div className="cos-band-inline cos-band-inline--right" style={{ backgroundImage: url }} aria-hidden="true" />
                {children}
            </div>
        );
    }

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
        // `cos-band-preview` et non `cos-band` : la seconde est en position fixe
        // et irait se coller en haut de la fenêtre au lieu de rester dans sa
        // carte. Deux usages, deux classes.
        return (
            <span
                className="cos-band-preview"
                style={{ backgroundImage: bandUrl, backgroundSize: '2.4rem auto', width: '2.4rem', height: '5.5rem' }}
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