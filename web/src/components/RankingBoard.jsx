import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { contenderPhoto } from '../lib/media.js';
import ArtistFigure from './ArtistFigure.jsx';

/* ---------------------------------------------------------------------------
   Classement à composer, au glisser-déposer.

   Pointer Events plutôt que l'API HTML5 drag-and-drop : celle-ci n'existe pas
   sur mobile. Ici la même implémentation couvre souris, stylet et doigt.
   Les flèches du clavier restent branchées sur la poignée, sinon la fonction
   devient inaccessible.

   Les déplacements sont animés en FLIP : on mesure les positions avant le
   rendu, on applique la transformation inverse, on la relâche à zéro. Aucun
   surcoût de layout, et `prefers-reduced-motion` coupe tout.
   --------------------------------------------------------------------------- */

const EASE = 'cubic-bezier(.2,.9,.25,1)';
const DURATION = 240;
const EDGE = 90; // marge de défilement automatique, en px

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Anime tout déplacement de position des noeuds enregistrés.
 *
 * `orderKey` doit résumer l'ordre visuel affiché (un `join('|')` des ids
 * suffit). C'est la dépendance de l'effet : sans elle, React relance la
 * mesure et réinitialise la transition de chaque carte à chaque rendu — y
 * compris les dizaines de rendus par seconde déclenchés par le simple
 * déplacement du doigt pendant un glissement, ce qui hache l'animation.
 * Avec elle, l'effet ne s'exécute que lorsque l'ordre a réellement bougé.
 */
function useFlip(orderKey, skipId) {
  const nodes = useRef(new Map());
  const previous = useRef(new Map());

  useLayoutEffect(() => {
    const next = new Map();
    const animate = !prefersReducedMotion();

    for (const [id, el] of nodes.current) {
      if (!el?.isConnected) continue;
      const rect = el.getBoundingClientRect();
      next.set(id, rect);

      if (!animate || id === skipId) continue;
      const old = previous.current.get(id);
      if (!old) continue;

      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${DURATION}ms ${EASE}`;
        el.style.transform = 'translate3d(0, 0, 0)';
      });
    }
    previous.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, skipId]);

  const register = useCallback(
    (id) => (el) => {
      if (el) nodes.current.set(id, el);
      else nodes.current.delete(id);
    },
    []
  );

  return { register, nodes };
}

/** Égalité par valeur, pour éviter un rendu quand la cible n'a pas changé. */
function sameTarget(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.list === b.list && a.index === b.index;
}

export default function RankingBoard({ phase, contenders, order, onChange, locked }) {
  const { t } = useI18n();
  const cut = phase.qualifierCount ?? null;

  const byId = useMemo(() => new Map(contenders.map((c) => [c.id, c])), [contenders]);

  const [drag, setDrag] = useState(null); // { id, from, x, y, offX, offY, w, h }
  const [target, setTarget] = useState(null); // { list: 'ranked', index } | { list: 'pool' }

  const dragRef = useRef(null);
  const targetRef = useRef(null);
  dragRef.current = drag;
  targetRef.current = target;

  const rankedZone = useRef(null);
  const poolZone = useRef(null);
  const rows = useRef(new Map()); // id → élément de ligne, pour le test de survol

  /* --- Ordre affiché : l'ordre réel, plus l'aperçu du dépôt en cours ------ */

  const preview = useMemo(() => {
    if (!drag || !target) return order;
    const base = order.filter((id) => id !== drag.id);
    if (target.list !== 'ranked') return base;
    const at = Math.max(0, Math.min(target.index, base.length));
    return [...base.slice(0, at), drag.id, ...base.slice(at)];
  }, [order, drag, target]);

  // La colonne « à placer » dérive elle aussi de `preview` (elle liste les
  // contenders qui n'y figurent pas) : une seule clé suffit pour les deux
  // colonnes, l'effet se redéclenche dès que l'une ou l'autre bouge.
  const { register } = useFlip(preview.join(','), drag?.id);

  const ranked = preview.map((id) => byId.get(id)).filter(Boolean);
  const pool = contenders.filter((c) => !preview.includes(c.id));

  /* --- Où le doigt se trouve-t-il ? --------------------------------------- */

  const resolveTarget = useCallback(
    (x, y) => {
      const current = dragRef.current;
      if (!current) return null;

      const near = (el, pad = 20) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
      };

      if (!near(rankedZone.current) && near(poolZone.current)) return { list: 'pool' };

      // On teste contre les lignes *hors* celle qu'on déplace : l'index obtenu
      // est directement l'index d'insertion dans la liste sans l'élément.
      const others = preview.filter((id) => id !== current.id);
      let index = others.length;
      for (let i = 0; i < others.length; i += 1) {
        const el = rows.current.get(others[i]);
        if (!el?.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { list: 'ranked', index };
    },
    [preview]
  );

  /* --- Cycle de vie du glissement ---------------------------------------- */

  const startDrag = useCallback(
    (event, id, from) => {
      if (locked) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const row = event.currentTarget.closest('[data-row]');
      if (!row) return;

      const r = row.getBoundingClientRect();
      event.preventDefault();

      setDrag({
        id,
        from,
        x: event.clientX,
        y: event.clientY,
        offX: event.clientX - r.left,
        offY: event.clientY - r.top,
        w: r.width,
        h: r.height,
      });
      setTarget(from === 'ranked' ? { list: 'ranked', index: order.indexOf(id) } : null);
    },
    [locked, order]
  );

  // Les poignées de glissement changent à chaque pixel parcouru. On garde les
  // valeurs fraîches dans une ref pour ne pas réabonner les écouteurs à chaque
  // mouvement : l'abonnement ne dépend que du fait qu'un glissement est actif.
  const latest = useRef({});
  latest.current = { order, onChange, resolveTarget };

  const dragging = Boolean(drag);

  useEffect(() => {
    if (!dragging) return undefined;

    const move = (event) => {
      event.preventDefault();
      const { clientX: x, clientY: y } = event;
      setDrag((d) => (d ? { ...d, x, y } : d));
      // resolveTarget renvoie un objet neuf à chaque appel : sans ce filtre,
      // le simple fait de bouger la souris de quelques pixels sans jamais
      // franchir la ligne médiane d'une autre carte redéclenche quand même un
      // rendu, et donc l'effet de mesure des positions.
      setTarget((prev) => {
        const next = latest.current.resolveTarget(x, y);
        return sameTarget(prev, next) ? prev : next;
      });

      // Défilement automatique près des bords de la fenêtre.
      if (y < EDGE) window.scrollBy(0, -Math.ceil((EDGE - y) / 6));
      else if (y > window.innerHeight - EDGE) {
        window.scrollBy(0, Math.ceil((y - window.innerHeight + EDGE) / 6));
      }
    };

    const finish = () => {
      const current = dragRef.current;
      const dest = targetRef.current;
      const { order: live, onChange: commit } = latest.current;
      setDrag(null);
      setTarget(null);
      if (!current) return;

      const base = live.filter((id) => id !== current.id);
      if (!dest || dest.list === 'pool') {
        if (current.from === 'ranked') commit(base);
        return;
      }
      const at = Math.max(0, Math.min(dest.index, base.length));
      commit([...base.slice(0, at), current.id, ...base.slice(at)]);
    };

    const cancel = () => {
      setDrag(null);
      setTarget(null);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') cancel();
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    document.body.classList.add('is-dragging');

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('is-dragging');
    };
  }, [dragging]);

  /* --- Actions au clavier et au clic -------------------------------------- */

  const move = (id, delta) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  const onRowKeyDown = (event, id) => {
    if (locked) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(id, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onChange(order.filter((x) => x !== id));
    }
  };

  const fillBySeed = () => {
    const rest = contenders
      .filter((c) => !order.includes(c.id))
      .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
      .map((c) => c.id);
    onChange([...order, ...rest]);
  };

  const dragged = drag ? byId.get(drag.id) : null;

  return (
    <div className="ladder">
      {/* ---- Colonne classée ---- */}
      <section
        ref={rankedZone}
        className={`ladder__col${target?.list === 'ranked' ? ' ladder__col--active' : ''}`}
        aria-label={t('ranking.title')}
      >
        <header className="ladder__head">
          <p className="eyebrow" style={{ margin: 0 }}>
            {t('ranking.title')}
            {cut ? ` — ${t('ranking.cut', { n: cut })}` : ''}
          </p>
          <span className="ladder__count data">
            {t('ranking.progress', { placed: order.length, total: contenders.length })}
          </span>
        </header>

        <div className="ladder__list">
          {ranked.length === 0 && !drag && (
            <p className="ladder__hint">{t('ranking.empty')}</p>
          )}

          {ranked.map((c, i) => {
            const isDragged = drag?.id === c.id;
            const qualified = cut != null && i < cut;

            return (
              <div key={c.id}>
                {cut != null && i === cut && (
                  <p className="cutline">
                    <span className="cutline__rule" />
                    <span className="cutline__label">{t('ranking.cutline')}</span>
                  </p>
                )}

                <div
                  data-row=""
                  ref={(el) => {
                    register(c.id)(el);
                    if (el) rows.current.set(c.id, el);
                    else rows.current.delete(c.id);
                  }}
                  className={
                    'card card--ranked' +
                    (qualified ? ' card--qualified' : '') +
                    (isDragged ? ' card--ghosted' : '')
                  }
                  onKeyDown={(e) => onRowKeyDown(e, c.id)}
                >
                  <button
                    type="button"
                    className="card__grip"
                    aria-label={t('ranking.grab', { name: c.name })}
                    disabled={locked}
                    onPointerDown={(e) => startDrag(e, c.id, 'ranked')}
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>

                  <span className="card__rank">{i + 1}</span>
                  <ArtistFigure src={contenderPhoto(c)} name={c.name} size="sm" />
                  <span className="card__name">{c.name}</span>

                  <button
                    type="button"
                    className="card__drop"
                    aria-label={t('ranking.remove', { name: c.name })}
                    disabled={locked}
                    onClick={() => onChange(order.filter((id) => id !== c.id))}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!locked && (
          <footer className="ladder__foot">
            <button type="button" className="btn btn--small btn--ghost" onClick={fillBySeed}>
              {t('ranking.fill')}
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => onChange([])}
              disabled={order.length === 0}
            >
              {t('ranking.reset')}
            </button>
            <span className="faint ladder__tip">{t('ranking.hint')}</span>
          </footer>
        )}
      </section>

      {/* ---- Colonne à placer ---- */}
      <section
        ref={poolZone}
        className={`ladder__col ladder__col--pool${target?.list === 'pool' ? ' ladder__col--active' : ''}`}
        aria-label={t('ranking.pool')}
      >
        <header className="ladder__head">
          <p className="eyebrow" style={{ margin: 0 }}>
            {t('ranking.pool')}
          </p>
          <span className="ladder__count data">{pool.length}</span>
        </header>

        <div className="ladder__list">
          {drag?.from === 'ranked' && target?.list === 'pool' && (
            <div className="ladder__drop">{t('ranking.drop')}</div>
          )}
          {pool.length === 0 && !drag && <p className="ladder__hint">{t('ranking.pool.empty')}</p>}

          {pool.map((c) => (
            <div
              key={c.id}
              data-row=""
              ref={register(c.id)}
              className={`card card--pool${drag?.id === c.id ? ' card--ghosted' : ''}`}
            >
              <button
                type="button"
                className="card__grip"
                aria-label={t('ranking.grab', { name: c.name })}
                disabled={locked}
                onPointerDown={(e) => startDrag(e, c.id, 'pool')}
              >
                <span aria-hidden="true">⠿</span>
              </button>

              <span className="card__seed">{c.seed ?? '—'}</span>
              <ArtistFigure src={contenderPhoto(c)} name={c.name} size="sm" />
              <span className="card__name">{c.name}</span>

              <button
                type="button"
                className="btn btn--small"
                disabled={locked}
                onClick={() => onChange([...order, c.id])}
              >
                {order.length + 1}
                <span className="visually-hidden"> — {t('ranking.add', { name: c.name })}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Le carton qui suit le doigt ---- */}
      {dragged && (
        <div
          className="card card--flying"
          style={{
            width: drag.w,
            transform: `translate3d(${drag.x - drag.offX}px, ${drag.y - drag.offY}px, 0)`,
          }}
          aria-hidden="true"
        >
          <span className="card__grip" aria-hidden="true">
            ⠿
          </span>
          <span className="card__rank">
            {target?.list === 'ranked' ? Math.min(target.index, order.length) + 1 : '·'}
          </span>
          <ArtistFigure src={contenderPhoto(dragged)} name={dragged.name} size="sm" />
          <span className="card__name">{dragged.name}</span>
        </div>
      )}
    </div>
  );
}