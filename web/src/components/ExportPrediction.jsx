import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { useI18n } from '../lib/i18n.jsx';
import {
    EXPORT_PIXEL_SCALE,
    FORMATS,
    buildCardModel,
    drawCard,
    ensureFonts,
    fileNameFor,
    paletteForSkin,
    previewScale,
    readPalette,
} from '../lib/predictionCard.js';

const ORDER = ['square', 'story', 'wide'];

/**
 * Exporter un pronostic en image.
 *
 * ─── Pourquoi deux rendus et non un seul ────────────────────────────────────
 *
 * La première version dessinait une fois, à la définition du fichier — 2160 px
 * de large — et laissait le navigateur réduire ce canvas à quelque cinq cents
 * pixels pour l'afficher. À ce facteur de réduction, les traits d'un pixel
 * disparaissent et les lettres s'empâtent : l'aperçu paraissait flou alors que
 * le fichier téléchargé était net. Or c'est sur l'aperçu qu'on juge, donc
 * l'aperçu avait tort même quand le fichier avait raison.
 *
 * Ici l'aperçu est dessiné à la définition EXACTE de son affichage — sa largeur
 * en pixels CSS multipliée par la densité de l'écran. Il n'y a plus de
 * réduction du tout, donc plus rien à perdre. Le fichier, lui, est rendu à part
 * au moment du clic, dans un canvas hors écran, à pleine définition.
 *
 * Le coût est un second tracé au téléchargement, de l'ordre de quelques
 * dizaines de millisecondes. C'est le prix d'un aperçu qui dit la vérité.
 *
 * ─── Le partage ─────────────────────────────────────────────────────────────
 *
 * Aucune API ne permet de publier sur une story depuis un site web : il faut
 * passer la main au système. Le bouton n'apparaît donc que là où
 * `navigator.share` accepte les fichiers, c'est-à-dire sur mobile.
 */
export default function ExportPrediction({ prediction, onClose }) {
    const { t, lang } = useI18n();

    const canvas = useRef(null);
    const frame = useRef(null);

    const [format, setFormat] = useState('story');
    const [boxW, setBoxW] = useState(0);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState(null);
    const [shared, setShared] = useState(null);

    const spec = FORMATS[format];
    const model = buildCardModel(prediction, { t, lang });

    /**
     * La palette effective : celle du site, puis celle du skin porté par
     * l'AUTEUR du pronostic. Pas celle du lecteur : une carte doit ressembler à
     * ce que son auteur a choisi, y compris consultée par quelqu'un d'autre.
     */
    const palette = () => paletteForSkin(readPalette(), model.skinId);
    const name = fileNameFor(model, spec);

    /**
     * La largeur d'affichage de l'aperçu.
     *
     * Mesurée sur le conteneur plutôt que devinée : la fenêtre change de largeur
     * avec l'écran, et une story est bornée par la HAUTEUR disponible, pas par la
     * largeur. Sans cette seconde borne, une story de 1920 de haut sortirait du
     * cadre et il faudrait faire défiler pour voir le pied.
     */
    const measure = useCallback(() => {
        if (frame.current) setBoxW(frame.current.clientWidth);
    }, []);

    useLayoutEffect(() => {
        measure();
        const ro = new ResizeObserver(measure);
        if (frame.current) ro.observe(frame.current);
        window.addEventListener('resize', measure);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [measure]);

    const maxH = typeof window === 'undefined' ? 600 : window.innerHeight * 0.52;
    const cssW = Math.max(1, Math.min(boxW || 1, (maxH * spec.w) / spec.h));
    const cssH = (cssW * spec.h) / spec.w;

    useEffect(() => {
        let cancelled = false;
        if (!boxW) return undefined;

        (async () => {
            setBusy(true);
            setError(null);
            try {
                // Les polices d'abord : le canvas ne déclenche pas leur chargement, il
                // se contente de ce qui est déjà disponible. Sans cette attente, le
                // premier rendu sort en police système.
                await ensureFonts();
                if (cancelled || !canvas.current) return;

                drawCard(canvas.current, model, spec, palette(), {
                    pixelScale: previewScale(spec, cssW),
                });

                // Le canvas porte sa définition dans `width`/`height` et sa taille
                // d'affichage dans le style. Les deux coïncident à la densité près,
                // donc aucun rééchantillonnage.
                canvas.current.style.width = `${cssW}px`;
                canvas.current.style.height = `${cssH}px`;
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // `model` est reconstruit à chaque rendu ; le suivre relancerait le tracé en
        // boucle. Les entrées qui comptent sont le pronostic, le format et la
        // largeur d'affichage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prediction, format, cssW, boxW, t, lang, model.skinId]);

    /** Le fichier, rendu hors écran à pleine définition au moment du clic. */
    const renderFile = async () => {
        await ensureFonts();
        const off = document.createElement('canvas');
        drawCard(off, model, spec, palette(), { pixelScale: EXPORT_PIXEL_SCALE });
        return new Promise((resolve, reject) => {
            off.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas vide.'))), 'image/png');
        });
    };

    const download = async () => {
        try {
            const blob = await renderFile();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            // Sans cette libération, le blob reste en mémoire jusqu'au rechargement
            // de la page. Le délai laisse au navigateur le temps de lancer le
            // téléchargement avant que l'URL cesse d'exister.
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
            setError(err.message);
        }
    };

    const share = async () => {
        try {
            const blob = await renderFile();
            const file = new File([blob], name, { type: 'image/png' });
            if (!navigator.canShare?.({ files: [file] })) {
                setShared(false);
                return;
            }
            await navigator.share({ files: [file], title: model.title });
        } catch (err) {
            // L'abandon du panneau de partage lève une erreur : ce n'est pas un
            // incident, l'annoncer comme tel serait mensonger.
            if (err.name !== 'AbortError') setError(err.message);
        }
    };

    const canShare = typeof navigator !== 'undefined' && Boolean(navigator.canShare);
    const outW = spec.w * EXPORT_PIXEL_SCALE;
    const outH = spec.h * EXPORT_PIXEL_SCALE;

    return (
        <Modal
            wide
            title={t('export.title')}
            onClose={onClose}
            footer={
                <>
                    <button className="btn btn--primary" disabled={busy} onClick={download}>
                        {t('export.download')}
                    </button>
                    {canShare && (
                        <button className="btn" disabled={busy} onClick={share}>
                            {t('export.share')}
                        </button>
                    )}
                    <span className="faint data" style={{ fontSize: '0.8rem' }}>
                        {outW} × {outH} px
                    </span>
                    <button className="btn btn--ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>
                        {t('thread.close')}
                    </button>
                </>
            }
        >
            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                {ORDER.map((id) => (
                    <button
                        key={id}
                        className={`btn btn--small${format === id ? ' btn--primary' : ' btn--ghost'}`}
                        aria-pressed={format === id}
                        onClick={() => setFormat(id)}
                    >
                        {t(`export.format.${id}`)}
                    </button>
                ))}
            </div>

            {error && <p className="notice" style={{ marginTop: '0.8rem' }}>{error}</p>}
            {shared === false && (
                <p className="notice" style={{ marginTop: '0.8rem' }}>{t('export.share.unsupported')}</p>
            )}

            <div
                ref={frame}
                style={{
                    marginTop: '1rem',
                    border: '1px solid var(--line)',
                    padding: '0.6rem',
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
                <canvas
                    ref={canvas}
                    style={{ display: 'block', opacity: busy ? 0.4 : 1 }}
                />
            </div>

            <p className="faint" style={{ fontSize: '0.85rem', marginTop: '0.7rem' }}>
                {t('export.hint')}
            </p>
        </Modal>
    );
}