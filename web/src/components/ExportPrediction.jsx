import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { useI18n } from '../lib/i18n.jsx';
import {
    FORMATS,
    buildCardModel,
    drawCard,
    ensureFonts,
    fileNameFor,
    readPalette,
} from '../lib/predictionCard.js';

const ORDER = ['square', 'story', 'wide'];

/**
 * Exporter un pronostic en image.
 *
 * Le canvas est tracé à sa taille réelle — 1080 ou 1600 pixels de large — et
 * réduit à l'écran par le CSS. Dessiner à la taille d'aperçu puis agrandir
 * donnerait une image floue, et l'aperçu doit montrer exactement ce qui sera
 * téléchargé, y compris les textes coupés.
 *
 * Deux sorties. Le téléchargement marche partout. Le partage natif n'existe
 * que sur mobile, mais c'est le SEUL chemin vers une story Instagram depuis un
 * site web : aucune API ne permet d'y publier directement, il faut passer la
 * main au système. Le bouton n'apparaît donc que là où il fonctionne.
 */
export default function ExportPrediction({ prediction, onClose }) {
    const { t } = useI18n();
    const canvas = useRef(null);

    const [format, setFormat] = useState('story');
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState(null);
    const [shared, setShared] = useState(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setBusy(true);
            setError(null);
            try {
                // Les polices d'abord : le canvas ne déclenche pas leur chargement, il
                // se contente de ce qui est déjà disponible. Sans cette attente, la
                // première carte sort en police système.
                await ensureFonts();
                if (cancelled || !canvas.current) return;
                const model = buildCardModel(prediction, { t });
                drawCard(canvas.current, model, FORMATS[format], readPalette());
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [prediction, format, t]);

    const toBlob = () =>
        new Promise((resolve, reject) => {
            canvas.current.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('Canvas vide.'))),
                'image/png'
            );
        });

    const model = buildCardModel(prediction, { t });
    const name = fileNameFor(model, FORMATS[format]);

    const download = async () => {
        try {
            const blob = await toBlob();
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
            const blob = await toBlob();
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

    return (
        <Modal
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
                style={{
                    marginTop: '1rem',
                    border: '1px solid var(--line)',
                    padding: '0.6rem',
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
                {/* La hauteur est plafonnée en unités de fenêtre : une story fait
            1920 pixels de haut, elle sortirait de l'écran si on la laissait
            s'afficher à l'échelle du modal. */}
                <canvas
                    ref={canvas}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '55vh',
                        height: 'auto',
                        width: 'auto',
                        display: 'block',
                        opacity: busy ? 0.4 : 1,
                    }}
                />
            </div>

            <p className="faint" style={{ fontSize: '0.85rem', marginTop: '0.7rem' }}>
                {t('export.hint')}
            </p>
        </Modal>
    );
}