import {
    IconCrown,
    IconHexagon,
    IconMicrophone2,
    IconRepeat,
    IconWorld,
} from '@tabler/icons-react';
import { badgeByCode as _b, itemById as _i } from '../lib/cosmetics.js';

/**
 * Tout ce qui se PORTE ou se GAGNE, en un seul fichier.
 *
 * Les icônes viennent de Tabler (traits 2 px, monochromes, colorables par
 * currentColor — du télétexte vectoriel), remaniées à notre sauce : elles ne
 * s'affichent jamais nues, toujours dans nos cartouches, et les glyphes trop
 * spécifiques (la casquette) sont dessinés main dans le même gabarit 24×24.
 * Le mapping vit ici et nulle part ailleurs : changer d'icône = une ligne.
 *
 * Les badges, eux, sont du SVG maison intégral : la palette P411 n'a ni or ni
 * argent ni bronze, alors le NOMBRE de chevrons dit le palier, et le fond bleu
 * — le seul fond de bloc que le système autorise — est réservé au vainqueur.
 */

const COLOR = {
    y: 'var(--y)',
    c: 'var(--c)',
    g: 'var(--g)',
    m: 'var(--m)',
    r: 'var(--r)',
    w: 'var(--w)',
    b: 'var(--b)',
};

/* --- La casquette, dessinée main dans le gabarit Tabler (24×24, trait 2) --- */
function CapIcon({ size = 16, ...props }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            {...props}
        >
            {/* la calotte */}
            <path d="M4 13a8 8 0 0 1 16 0" />
            {/* le bandeau */}
            <path d="M4 13h16" />
            {/* la visière */}
            <path d="M20 13h3v2h-4" />
            {/* le bouton */}
            <path d="M12 5v-2" />
        </svg>
    );
}

const ICONS = {
    mic: IconMicrophone2,
    cap: CapIcon,
    loop: IconRepeat,
    hex: IconHexagon,
    globe: IconWorld,
    crown: IconCrown,
};

/* ---------------------------------------------------------------------------
   Le pin : la petite icône à côté d'un nom.
   --------------------------------------------------------------------------- */
export function Flair({ itemId, size = 16 }) {
    const item = _i(itemId);
    if (!item || item.slot !== 'flair') return null;
    const Icon = ICONS[item.icon];
    if (!Icon) return null;
    return (
        <span
            className="cos-flair"
            style={{ color: item.color === 'b' ? COLOR.c : COLOR[item.color] }}
            title={item.name.en}
        >
            <Icon size={size} stroke={2} />
        </span>
    );
}

/* ---------------------------------------------------------------------------
   Le titre : la ligne magenta sous le pseudo — la couleur des méta-infos.
   --------------------------------------------------------------------------- */
export function Title({ itemId, lang = 'en' }) {
    const item = _i(itemId);
    if (!item || item.slot !== 'title') return null;
    return <p className="cos-title data">{item.name[lang] ?? item.name.en}</p>;
}

/* ---------------------------------------------------------------------------
   Le cadre : autour de l'avatar. Le style visuel vit dans shop.css sous
   `cos-frame--<id>` — ici on ne fait qu'accrocher la bonne classe.
   --------------------------------------------------------------------------- */
export function FramedAvatar({ url, frameId, size = 'md', alt = '' }) {
    const item = _i(frameId);
    const frameClass = item && item.slot === 'frame' ? ` cos-frame--${item.id}` : '';
    if (!url) return null;
    return (
        <span className={`cos-frame cos-frame--${size}${frameClass}`}>
            <img src={url} alt={alt} />
        </span>
    );
}

/* ---------------------------------------------------------------------------
   Le badge : un cartouche SVG carré, 2 px de trait, zéro arrondi.

   Le langage visuel :
     ticket perforé blanc        → participation
     1 / 2 / 3 chevrons          → bronze (magenta) / silver (cyan) / gold (jaune)
     chiffre sur socle           → podium 3 (vert) et 2 (cyan)
     couronne + 1 sur fond bleu  → vainqueur
   --------------------------------------------------------------------------- */
export function BadgeMedal({ code, size = 56, label = null }) {
    const badge = _b(code);
    if (!badge) return null;
    const c = COLOR[badge.color];
    const S = 56; // gabarit interne fixe, mis à l'échelle par width/height

    return (
        <span className="cos-badge" style={{ width: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={code}>
                {/* Le fond bleu du vainqueur — le seul fond de bloc autorisé. */}
                {badge.code === 'PODIUM_1' && <rect x="3" y="3" width="50" height="50" fill="var(--b)" />}
                <rect x="3" y="3" width="50" height="50" fill="none" stroke={c} strokeWidth="2" />
                {/* Les coins télétexte : quatre ticks, jamais un arrondi. */}
                <path d="M3 11V3h8 M45 3h8v8 M53 45v8h-8 M11 53H3v-8" fill="none" stroke={c} strokeWidth="2" />

                {badge.kind === 'ticket' && (
                    <g stroke={c} strokeWidth="2" fill="none">
                        <rect x="14" y="20" width="28" height="16" />
                        {/* les perforations : deux encoches carrées, découpe au fond d'écran */}
                        <rect x="12" y="26" width="4" height="4" fill="var(--screen)" stroke="none" />
                        <rect x="40" y="26" width="4" height="4" fill="var(--screen)" stroke="none" />
                        <path d="M24 20v16" strokeDasharray="2 3" />
                    </g>
                )}

                {badge.kind === 'tier' && (
                    <g stroke={c} strokeWidth="3" fill="none" strokeLinecap="square">
                        {Array.from({ length: badge.chevrons }).map((_, i) => {
                            const y = 28 + (badge.chevrons - 1) * 4 - i * 8;
                            return <path key={i} d={`M18 ${y + 6} L28 ${y - 4} L38 ${y + 6}`} />;
                        })}
                    </g>
                )}

                {badge.kind === 'podium' && (
                    <g>
                        {badge.rank === 1 && (
                            /* la couronne : trois dents carrées au-dessus du chiffre */
                            <path
                                d="M19 18v-6l6 4 3-6 3 6 6-4v6z"
                                fill="none"
                                stroke={c}
                                strokeWidth="2"
                                strokeLinejoin="miter"
                            />
                        )}
                        <text
                            x="28"
                            y={badge.rank === 1 ? 42 : 38}
                            textAnchor="middle"
                            fill={c}
                            fontFamily="var(--font-display)"
                            fontSize={badge.rank === 1 ? 24 : 28}
                        >
                            {badge.rank}
                        </text>
                        {/* le socle */}
                        <path d={`M18 ${badge.rank === 1 ? 46 : 44}h20`} stroke={c} strokeWidth="3" />
                    </g>
                )}
            </svg>
            {label && <span className="cos-badge__tag data">{label}</span>}
        </span>
    );
}