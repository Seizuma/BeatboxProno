import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { EXPORT_PIXEL_SCALE, previewScale } from '../lib/predictionCard.js';
import {
  FORMATS,
  buildEventCard,
  drawEventCard,
  ensureFonts,
  eventFileName,
  readPalette,
} from '../lib/eventCard.js';

const ORDER = ['story', 'square'];

/**
 * L'affiche d'annonce d'un événement, à publier sur les réseaux.
 *
 * ─── Pourquoi ce composant recharge l'événement ──────────────────────────────
 *
 * La liste de l'administration ne porte que le nom, le statut et le décompte
 * des pronostics : elle n'a jamais eu besoin d'autre chose. L'affiche, elle,
 * veut le lieu, les dates, les catégories et leurs inscrits.
 *
 * Plutôt que d'alourdir la liste pour une fenêtre qu'on ouvre trois fois par
 * compétition, ce composant appelle `/events/:slug` — la même route que la page
 * publique, qui rend déjà tout cela. Le staff la reçoit non censurée, ce qui
 * permet de préparer l'affiche d'un événement encore en brouillon.
 *
 * ─── Deux rendus, comme pour l'export de pronostic ───────────────────────────
 *
 * L'aperçu est dessiné à la définition EXACTE de son affichage, donc sans
 * aucune réduction : un canvas de 2160 px ramené à 400 px par le navigateur
 * perd ses traits fins et paraît flou, alors que le fichier ne l'est pas. Le
 * fichier est rendu à part, hors écran, au moment du clic.
 */
export default function ExportEvent({ slug, onClose }) {
  const { t, locale } = useI18n();

  const canvas = useRef(null);
  const frame = useRef(null);

  const [event, setEvent] = useState(null);
  const [format, setFormat] = useState('story');
  const [boxW, setBoxW] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const [shared, setShared] = useState(null);

  const spec = FORMATS[format];

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then(({ event }) => setEvent(event))
      .catch((e) => setError(e.message));
  }, [slug]);

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

  // Une story fait 1920 de haut : bornée par la HAUTEUR disponible et non par
  // la largeur, sans quoi elle pousserait les boutons hors de l'écran.
  const maxH = typeof window === 'undefined' ? 600 : window.innerHeight * 0.5;
  const cssW = Math.max(1, Math.min(boxW || 1, (maxH * spec.w) / spec.h));
  const cssH = (cssW * spec.h) / spec.w;

  useEffect(() => {
    let cancelled = false;
    if (!event || !boxW) return undefined;

    (async () => {
      setBusy(true);
      try {
        // Les polices d'abord : le canvas ne déclenche pas leur chargement, il
        // se contente de ce qui est déjà disponible.
        await ensureFonts();
        if (cancelled || !canvas.current) return;

        const card = buildEventCard(event, { locale });
        drawEventCard(canvas.current, card, spec, readPalette(), {
          pixelScale: previewScale(spec, cssW),
        });
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
  }, [event, format, cssW, cssH, boxW, locale, spec]);

  const renderFile = async () => {
    await ensureFonts();
    const card = buildEventCard(event, { locale });
    const off = document.createElement('canvas');
    drawEventCard(off, card, spec, readPalette(), { pixelScale: EXPORT_PIXEL_SCALE });
    return new Promise((resolve, reject) => {
      off.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas vide.'))), 'image/png');
    });
  };

  const name = event ? eventFileName(buildEventCard(event, { locale }), spec) : 'annonce.png';

  const download = async () => {
    try {
      const blob = await renderFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      // Sans cette libération, le blob reste en mémoire jusqu'au rechargement.
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
      await navigator.share({ files: [file], title: name });
    } catch (err) {
      // L'abandon du panneau de partage lève une erreur : ce n'est pas un
      // incident, l'annoncer comme tel serait mensonger.
      if (err.name !== 'AbortError') setError(err.message);
    }
  };

  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.canShare);

  return (
    <Modal
      wide
      title={t('announce.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--primary" disabled={busy || !event} onClick={download}>
            {t('export.download')}
          </button>
          {canShare && (
            <button className="btn" disabled={busy || !event} onClick={share}>
              {t('export.share')}
            </button>
          )}
          <span className="faint data" style={{ fontSize: '0.8rem' }}>
            {spec.w * EXPORT_PIXEL_SCALE} × {spec.h * EXPORT_PIXEL_SCALE} px
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
        <canvas ref={canvas} style={{ display: 'block', opacity: busy ? 0.4 : 1 }} />
      </div>

      <p className="faint" style={{ fontSize: '0.85rem', marginTop: '0.7rem' }}>
        {t('announce.hint')}
      </p>
    </Modal>
  );
}