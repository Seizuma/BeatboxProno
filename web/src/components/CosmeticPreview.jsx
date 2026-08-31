import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';
import Profile from '../pages/Profile.jsx';
import { ReadOnlyBracket } from './PredictionView.jsx';
import { FramedAvatar, Name, bandImage } from './Cosmetics.jsx';
import { itemById } from '../lib/cosmetics.js';
import {
    FORMATS,
    buildCardModel,
    drawCard,
    ensureFonts,
    paletteForSkin,
    previewScale,
    readPalette,
} from '../lib/predictionCard.js';

/**
 * L'aperçu d'un objet, là où il se porte — pour de vrai.
 *
 * ─── Ce qui a changé ────────────────────────────────────────────────────────
 *
 * La première version montrait des MAQUETTES : une ligne de classement
 * inventée, une carte réduite à deux lignes, un tampon posé sur un rectangle.
 * On pouvait juger une couleur, pas un rendu. Trois objets méritent mieux, et
 * ce sont ceux qui coûtent le plus cher :
 *
 *   — une bande de profil s'essaie sur SON profil, avec ses vrais chiffres ;
 *   — un skin de carte s'essaie sur SON dernier pronostic, dessiné par le même
 *     code que l'export ;
 *   — un tampon s'essaie en le POSANT, sur le tableau et sur la carte, là où
 *     on veut, avec le geste et le bruit visuel d'un vrai tampon.
 *
 * Les cadres et les effets de pseudo gardent leurs vignettes : ils se jugent
 * sur une ligne, et une ligne suffit.
 */
export default function CosmeticPreview({ item, worn, user, lang, t, onClose }) {
    if (!item) return null;

    const pick = (slot) => (item.slot === slot ? item.id : worn?.[slot] ?? null);
    const title = item.name[lang] ?? item.name.en;
    const subtitle = t(`shop.section.${item.slot}`);

    if (item.slot === 'band') {
        return (
            <Modal wide title={title} subtitle={subtitle} onClose={onClose} footer={<Close t={t} onClose={onClose} />}>
                {/* Le vrai composant de profil, dans une fenêtre. `preview`
                    emprunte la bande, confine ses bords, et retire ce qui n'a
                    rien à faire dans un aperçu — déconnexion, zone dangereuse. */}
                <Profile preview={{ band: item.id }} />
                <Note t={t} />
            </Modal>
        );
    }

    if (item.slot === 'cardSkin') {
        return (
            <Modal wide title={title} subtitle={subtitle} onClose={onClose} footer={<Close t={t} onClose={onClose} />}>
                <LatestPrediction user={user} t={t}>
                    {(prediction) => (
                        <CardCanvas prediction={prediction} skinId={item.id} stamp={null} t={t} lang={lang} />
                    )}
                </LatestPrediction>
                <Note t={t} />
            </Modal>
        );
    }

    if (item.slot === 'stamp') {
        return (
            <Modal wide title={title} subtitle={subtitle} onClose={onClose} footer={<Close t={t} onClose={onClose} />}>
                <LatestPrediction user={user} t={t}>
                    {(prediction) => (
                        <StampPlayground
                            prediction={prediction}
                            stampId={item.id}
                            skinId={pick('cardSkin')}
                            t={t}
                            lang={lang}
                        />
                    )}
                </LatestPrediction>
                <Note t={t} />
            </Modal>
        );
    }

    // Cadres et effets de pseudo : la ligne et l'en-tête, comme avant.
    const frame = pick('frame');
    const nameFx = pick('nameFx');
    const avatar = user?.avatarUrl ?? null;
    const pseudo = user?.globalName ?? user?.username ?? 'SEIZUMA';
    const frameClass = frame ? ` ${itemById(frame)?.css ?? ''}` : '';
    const bandUrl = bandImage(worn?.band ?? null);

    return (
        <Modal title={title} subtitle={subtitle} onClose={onClose} footer={<Close t={t} onClose={onClose} />}>
            <div className="shop-live">
                <div className="shop-live__cell">
                    <span className="shop-live__title">{t('shop.live.leaderboard')}</span>
                    {[1, 2].map((rank) => (
                        <span className="shop-live__row" key={rank}>
                            <span className="shop-live__rank">{rank}</span>
                            {rank === 1 && avatar ? (
                                <FramedAvatar url={avatar} frameId={frame} size="sm" />
                            ) : (
                                <span className={`cos-frame cos-frame--sm${rank === 1 ? frameClass : ''}`} />
                            )}
                            <span>{rank === 1 ? <Name fxId={nameFx}>{pseudo}</Name> : 'NaPoM'}</span>
                            <span className="shop-live__pts">{rank === 1 ? 304 : 288}</span>
                        </span>
                    ))}
                </div>
                <div className="shop-live__cell">
                    <span className="shop-live__title">{t('shop.live.profile')}</span>
                    <span className="shop-live__profile">
                        <span className="shop-live__strip" style={{ backgroundImage: bandUrl, backgroundSize: '1.1rem auto' }} />
                        {avatar ? (
                            <FramedAvatar url={avatar} frameId={frame} size="lg" />
                        ) : (
                            <span className={`cos-frame cos-frame--lg${frameClass}`} />
                        )}
                        <span style={{ flex: 1, minWidth: 0 }}><Name fxId={nameFx}>{pseudo}</Name></span>
                        <span className="shop-live__strip shop-live__strip--right" style={{ backgroundImage: bandUrl, backgroundSize: '1.1rem auto' }} />
                    </span>
                </div>
            </div>
            <Note t={t} />
        </Modal>
    );
}

const Close = ({ t, onClose }) => <button className="btn" onClick={onClose}>{t('common.close')}</button>;
const Note = ({ t }) => <p className="shop-live__hint" style={{ marginTop: '0.8rem' }}>{t('shop.preview.note')}</p>;

/* ---------------------------------------------------------------------------
   Le dernier pronostic déposé
   --------------------------------------------------------------------------- */

/**
 * Charge le dernier pronostic DÉPOSÉ de la personne et le passe à ses enfants.
 *
 * Deux appels : la liste depuis le profil, puis la fiche complète. La liste
 * ne contient pas les affiches, et la fiche ne se cherche pas sans identifiant.
 * Un brouillon ne convient pas : c'est une hésitation, et on ne veut pas
 * habiller une hésitation.
 */
function LatestPrediction({ user, t, children }) {
    const [state, setState] = useState({ loading: true, prediction: null, error: null });

    useEffect(() => {
        let cancelled = false;
        if (!user?.id) {
            setState({ loading: false, prediction: null, error: null });
            return undefined;
        }
        (async () => {
            try {
                const { predictions } = await api.get(`/users/${user.id}`);
                const latest = predictions
                    .filter((p) => p.submitted)
                    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
                if (!latest) {
                    if (!cancelled) setState({ loading: false, prediction: null, error: null });
                    return;
                }
                const { prediction } = await api.get(`/predictions/${latest.id}`);
                if (!cancelled) setState({ loading: false, prediction, error: null });
            } catch (e) {
                if (!cancelled) setState({ loading: false, prediction: null, error: e.message });
            }
        })();
        return () => { cancelled = true; };
    }, [user?.id]);

    if (state.loading) return <p className="faint">{t('common.loading')}</p>;
    if (state.error) return <p className="notice">{state.error}</p>;
    if (!state.prediction) return <p className="empty">{t('shop.preview.noPrediction')}</p>;
    return children(state.prediction);
}

/* ---------------------------------------------------------------------------
   La carte, dessinée par le vrai code d'export
   --------------------------------------------------------------------------- */

/**
 * La carte partagée, au format carré, avec un skin et un tampon forcés.
 *
 * Même `buildCardModel`, même `drawCard`, même palette que le bouton Exporter :
 * ce qu'on voit ici est ce qui partira sur Instagram, au pixel près. La seule
 * différence est le format — carré, parce qu'une story de 1920 de haut ne
 * tient pas dans une fenêtre sans faire défiler.
 */
function CardCanvas({ prediction, skinId, stamp, t, lang, onClick, children }) {
    const canvas = useRef(null);
    const frame = useRef(null);
    const [boxW, setBoxW] = useState(0);

    const spec = FORMATS.square;

    useLayoutEffect(() => {
        const measure = () => { if (frame.current) setBoxW(frame.current.clientWidth); };
        measure();
        const ro = new ResizeObserver(measure);
        if (frame.current) ro.observe(frame.current);
        return () => ro.disconnect();
    }, []);

    const cssW = Math.max(1, Math.min(boxW || 1, window.innerHeight * 0.55));
    const cssH = (cssW * spec.h) / spec.w;

    useEffect(() => {
        let cancelled = false;
        if (!boxW) return undefined;
        (async () => {
            await ensureFonts();
            if (cancelled || !canvas.current) return;
            const model = buildCardModel(prediction, { t, lang, skinId, stamp });
            drawCard(canvas.current, model, spec, paletteForSkin(readPalette(), skinId), {
                pixelScale: previewScale(spec, cssW),
            });
        })();
        return () => { cancelled = true; };
    }, [prediction, skinId, stamp, boxW, cssW, t, lang, spec]);

    return (
        <div
            ref={frame}
            className={`shop-card-stage${onClick ? ' cos-stamp-host cos-stamp-host--placing' : ''}`}
            onClick={onClick}
        >
            <canvas ref={canvas} style={{ width: cssW, height: cssH, display: 'block', margin: '0 auto' }} />
            {children}
        </div>
    );
}

/* ---------------------------------------------------------------------------
   Le tampon, à poser soi-même
   --------------------------------------------------------------------------- */

/**
 * Deux onglets — le tableau et la carte — et UN tampon qu'on pose en cliquant.
 *
 * La position est partagée entre les deux : un tampon posé aux deux tiers du
 * tableau apparaît aux deux tiers de la carte, exactement comme le fera le
 * vrai. C'est la promesse de l'export, et c'est ici qu'on la vérifie avant
 * d'acheter.
 *
 * Le tampon n'est PAS dessiné dans le canvas : il est posé par-dessus, en
 * DOM, pour pouvoir s'animer. Même police, même bordure, même angle que la
 * version canvas — à l'œil, on ne fait pas la différence, et on gagne le
 * geste.
 */
function StampPlayground({ prediction, stampId, skinId, t, lang }) {
    const [tab, setTab] = useState('bracket');
    // Position en fractions, et un compteur qui rejoue l'animation à chaque pose.
    const [at, setAt] = useState(null);
    const [hits, setHits] = useState(0);
    const board = useRef(null);

    const place = (event) => {
        const host = event.currentTarget;
        const box = host.getBoundingClientRect();
        setAt({
            x: Math.min(0.95, Math.max(0.05, (event.clientX - box.left) / box.width)),
            y: Math.min(0.95, Math.max(0.05, (event.clientY - box.top) / box.height)),
        });
        setHits((n) => n + 1);
    };

    const item = itemById(stampId);
    const stamp = at && item && (
        // La clé change à chaque pose : React remonte l'élément et l'animation
        // repart de zéro, même quand on tamponne deux fois au même endroit.
        <span
            key={hits}
            className={`cos-stamp cos-stamp--posed cos-stamp--slam cos-stamp--${item.color}`}
            style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
            aria-hidden="true"
        >
            {item.text[lang] ?? item.text.en}
        </span>
    );

    // Le tableau seul, pas le pronostic entier : sur la vraie page, la position
    // du tampon est relative au BRACKET, et un classement d'éliminations
    // au-dessus fausserait la mesure. Le premier tableau de la catégorie est
    // celui que le tampon habite.
    const byId = new Map(prediction.category.contenders.map((c) => [c.id, c]));
    const photo = (c) => c?.imageUrl ?? c?.artists?.[0]?.artist?.imageUrl ?? null;
    const bracketPhase = prediction.category.phases.find((p) => ['BRACKET', 'LEGACY'].includes(p.type));
    const battles = bracketPhase
        ? prediction.battles.filter((b) => b.phaseId === bracketPhase.id && (b.winnerId || b.contenderAId))
        : [];

    return (
        <div className="stack" style={{ gap: '0.7rem' }}>
            <nav className="row" style={{ gap: '0.4rem' }}>
                {[['bracket', t('shop.live.bracket')], ['card', t('shop.live.card')]].map(([id, label]) => (
                    <button
                        key={id}
                        className={`btn btn--small${tab === id ? ' btn--primary' : ''}`}
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
                <span className="faint" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
                    {at ? t('shop.stamp.again') : t('shop.stamp.hint')}
                </span>
            </nav>

            {tab === 'bracket' && (
                battles.length ? (
                    <div ref={board} className="cos-stamp-host cos-stamp-host--placing" onClick={place}>
                        <ReadOnlyBracket battles={battles} byId={byId} photo={photo} />
                        {stamp}
                    </div>
                ) : (
                    <p className="empty">{t('shop.preview.noBracket')}</p>
                )
            )}

            {tab === 'card' && (
                <CardCanvas prediction={prediction} skinId={skinId} stamp={null} t={t} lang={lang} onClick={place}>
                    {stamp}
                </CardCanvas>
            )}
        </div>
    );
}