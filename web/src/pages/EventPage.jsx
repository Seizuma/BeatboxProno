import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import RankingBoard from '../components/RankingBoard.jsx';
import Toast from '../components/Toast.jsx';
import ScoringHelp from '../components/ScoringHelp.jsx';
import BracketBoard from '../components/BracketBoard.jsx';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const key = (round, slot) => `${round}:${slot}`;

export default function EventPage() {
  const { slug } = useParams();
  const { user } = useSession();
  const { t, date } = useI18n();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);

  // Brouillon local, par VERSION : { [predictionId]: { orders, picks } }
  const [draft, setDraft] = useState({});
  // La version ouverte pour chaque catégorie : { [categoryId]: predictionId }
  const [current, setCurrent] = useState({});
  // Les versions connues, par catégorie.
  const [versions, setVersions] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((payload) => {
        setData(payload);
        setActiveId(payload.event.categories[0]?.id ?? null);
        const { draft, versions, current } = hydrate(payload);
        setDraft(draft);
        setVersions(versions);
        setCurrent(current);
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const category = useMemo(
    () => data?.event.categories.find((c) => c.id === activeId) ?? null,
    [data, activeId]
  );

  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

  const { event } = data;
  const myVersions = versions[activeId] ?? [];
  const currentId = current[activeId] ?? null;
  const activeVersion = myVersions.find((v) => v.id === currentId) ?? null;
  // Tant qu'aucune version n'existe, on travaille sous une clé provisoire :
  // l'éditeur reste utilisable, et la version est créée au premier
  // enregistrement. Sans cela, une catégorie neuve restait grisée.
  const stateKey = currentId ?? `new:${activeId}`;
  const state = draft[stateKey] ?? { orders: {}, picks: {} };
  const eventClosed = event.status === 'FINISHED';

  const update = (patch) =>
    setDraft((d) => ({ ...d, [stateKey]: { ...(d[stateKey] ?? { orders: {}, picks: {} }), ...patch } }));

  // La date butoir de l'événement ferme tout. Absente — wildcards ouvertes,
  // date de la compète encore inconnue — rien ne ferme globalement : seuls les
  // verrous de phase s'appliquent.
  const deadline = event.predictionsCloseAt ? new Date(event.predictionsCloseAt) : null;
  const deadlinePassed = Boolean(deadline && deadline <= new Date());

  const phaseLocked = (phase) =>
    eventClosed ||
    deadlinePassed ||
    phase.resolved ||
    (phase.locksAt && new Date(phase.locksAt) <= new Date());

  /** Recharge mes versions après une action qui les fait bouger. */
  async function refreshVersions(categoryId, pick) {
    const { predictions } = await api.get(`/predictions/categories/${categoryId}`);
    setVersions((v) => ({ ...v, [categoryId]: predictions }));
    setDraft((d) => {
      const next = { ...d };
      for (const p of predictions) next[p.id] = readVersion(p);
      return next;
    });
    const target = pick ?? predictions.find((p) => p.id === current[categoryId])?.id ?? predictions[0]?.id;
    setCurrent((c) => ({ ...c, [categoryId]: target ?? null }));
    return predictions;
  }

  /** Le contenu de l'éditeur, prêt pour l'API. */
  function payload() {
    return {
      ranks: Object.entries(state.orders).flatMap(([phaseId, ids]) =>
        ids.map((contenderId, i) => ({ phaseId, contenderId, rank: i + 1 }))
      ),
      battles: Object.values(state.picks).flatMap((byBattle) =>
        Object.values(byBattle).filter((b) => b.contenderAId && b.contenderBId)
      ),
    };
  }

  /**
   * Garantit qu'une version existe pour la catégorie courante, et renvoie son
   * identifiant. La création est paresseuse : on ne crée une ligne que le jour
   * où la personne enregistre vraiment quelque chose.
   */
  async function ensureVersion() {
    if (currentId) return currentId;
    const { prediction } = await api.post(`/predictions/categories/${activeId}`, {
      label: 'Mon pronostic',
    });
    // Le contenu saisi sous la clé provisoire suit la nouvelle version.
    setDraft((d) => ({ ...d, [prediction.id]: d[`new:${activeId}`] ?? { orders: {}, picks: {} } }));
    setCurrent((c) => ({ ...c, [activeId]: prediction.id }));
    return prediction.id;
  }

  /** Enregistre le contenu. Ne dépose rien : déposer est un geste distinct. */
  async function save() {
    setSaving(true);
    setFlash(null);
    try {
      const id = await ensureVersion();
      const res = await api.put(`/predictions/${id}`, payload());
      const list = await refreshVersions(activeId, id);
      // Nommer la version évite de chercher ensuite un brouillon qui n'a
      // jamais été créé parce qu'on éditait le pronostic déposé.
      const target = list.find((v) => v.id === id);
      setFlash({
        ok: true,
        at: Date.now(),
        text:
          res.note ??
          t(target?.submitted ? 'event.saved.filed' : 'event.saved.into', {
            name: target?.label ?? t('draft.untitled'),
          }),
      });
    } catch (e) {
      setFlash({ ok: false, at: Date.now(), text: e.message });
    } finally {
      setSaving(false);
    }
  }

  /** Dépose le pronostic. Toujours possible tant que l'événement est ouvert. */
  async function submitCurrent() {
    setSaving(true);
    setFlash(null);
    try {
      const id = await ensureVersion();
      await api.put(`/predictions/${id}`, payload());
      const res = await api.post(`/predictions/${id}/submit`);
      await refreshVersions(activeId, id);
      setFlash({ ok: true, at: Date.now(), text: res.note ?? t('event.saved.submit') });
    } catch (e) {
      setFlash({ ok: false, at: Date.now(), text: e.message });
    } finally {
      setSaving(false);
    }
  }

  /** Range l'état actuel dans un nouveau brouillon, sans quitter l'éditeur. */
  async function snapshot() {
    setSaving(true);
    setFlash(null);
    try {
      const id = await ensureVersion();
      await api.put(`/predictions/${id}`, payload());
      const { prediction } = await api.post(`/predictions/categories/${activeId}`, {
        copyFrom: id,
      });
      await refreshVersions(activeId, id);
      setFlash({ ok: true, at: Date.now(), text: t('draft.saved', { name: prediction.label }) });
    } catch (e) {
      setFlash({ ok: false, at: Date.now(), text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function versionAction(fn, okText) {
    setSaving(true);
    setFlash(null);
    try {
      const text = (await fn()) ?? okText;
      setFlash({ ok: true, at: Date.now(), text });
    } catch (e) {
      setFlash({ ok: false, at: Date.now(), text: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ paddingTop: 'clamp(2rem, 5vw, 3.5rem)', gap: '1.75rem' }}>
      <header style={{ paddingBottom: '0.5rem' }}>
        <p className="silkscreen">
          {event.location ?? '—'}
          {event.startsAt && ` · ${date(event.startsAt)}`}
        </p>
        <h1 className="hero__title" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4rem)' }}>
          {event.name} <em>{event.year}</em>
        </h1>
        {event.description && <p className="muted" style={{ maxWidth: '60ch' }}>{event.description}</p>}

        <p className="row" style={{ gap: '0.5rem', marginTop: '0.6rem' }}>
          <span className="tag">{t('event.judges', { n: event.judgeCount ?? 3 })}</span>
          <span className={`tag${deadlinePassed ? ' tag--done' : deadline ? ' tag--live' : ''}`}>
            {deadlinePassed
              ? t('event.deadline.passed')
              : deadline
                ? t('event.deadline', { date: date(deadline, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
                : t('event.deadline.none')}
          </span>
        </p>
      </header>

      <nav
        className="row"
        style={{ gap: '0.4rem', borderBottom: 'var(--frame)', paddingBottom: '0.75rem' }}
      >
        {event.categories.map((c) => {
          // Une étoile sur l'onglet : on voit d'un coup d'œil les catégories
          // pour lesquelles un pronostic est déjà déposé, sans le répéter
          // partout dans la page.
          const filed = (versions[c.id] ?? []).some((v) => v.submitted);
          return (
            <button
              key={c.id}
              className={`btn${c.id === activeId ? ' btn--primary' : ''}`}
              onClick={() => setActiveId(c.id)}
              title={filed ? t('draft.submitted') : undefined}
            >
              {c.name}
              {filed && <span aria-hidden="true"> ★</span>}
              {filed && <span className="visually-hidden"> — {t('draft.submitted')}</span>}
            </button>
          );
        })}
      </nav>

      {!user && <p className="notice">{t('event.signin')}</p>}

      {/* Toujours visible, même avec une seule version : sans elle, on ne
          savait pas si « Enregistrer » écrivait dans un brouillon ou dans le
          pronostic déposé — et l'on cherchait ensuite un brouillon qui
          n'existait pas. */}
      {user && category && !eventClosed && (
        <div className="versions">
          <label htmlFor="version" style={{ margin: 0 }}>{t('draft.load')}</label>

          {myVersions.length > 0 ? (
            <select
              id="version"
              value={currentId ?? ''}
              disabled={saving}
              onChange={(e) => setCurrent((c) => ({ ...c, [activeId]: e.target.value }))}
            >
              {myVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.submitted ? '★ ' : ''}{v.label ?? t('draft.untitled')}
                </option>
              ))}
            </select>
          ) : (
            <span className="faint">{t('draft.pending')}</span>
          )}

          <span className={`tag${activeVersion?.submitted ? ' tag--live' : ''}`}>
            {activeVersion?.submitted ? t('draft.submitted') : t('draft.isdraft')}
          </span>

          <span className="versions__actions">
            <button
              className="btn btn--small"
              onClick={snapshot}
              disabled={saving || myVersions.length >= 10}
            >
              {t('draft.snapshot')}
            </button>
            <span className="faint" style={{ fontSize: '0.82rem' }}>
              {myVersions.length}/10 · {t('draft.manage')}
            </span>
          </span>
        </div>
      )}

      {category && (
        <CategoryEditor
          category={category}
          event={event}
          state={state}
          update={update}
          phaseLocked={phaseLocked}
          locked={eventClosed || !user}
        />
      )}

      {user && !eventClosed && (
        <div className="actionbar">
          <button className="btn" onClick={save} disabled={saving}>
            {saving
              ? t('event.saving')
              : activeVersion?.submitted
                ? t('event.save.filed')
                : t('event.save.draft')}
          </button>
          <button className="btn btn--primary" onClick={submitCurrent} disabled={saving}>
            {saving
              ? t('event.saving')
              : activeVersion?.submitted
                ? t('event.resubmit')
                : t('event.save.submit')}
          </button>


          <button className="btn btn--small btn--ghost" onClick={() => setHelpOpen(true)}>
            ? {t('help.open')}
          </button>
          <span className="faint" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
            {t('event.editable')}
          </span>
        </div>
      )}

      <Toast
        message={flash?.text}
        ok={flash?.ok}
        onDismiss={() => setFlash(null)}
      />
      {helpOpen && <ScoringHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function CategoryEditor({ category, event, state, update, phaseLocked, locked }) {
  const { t } = useI18n();
  const contenders = category.contenders;

  // Le classement de la dernière phase de qualification sert à composer l'arbre.
  const qualifyingPhase = [...category.phases]
    .filter((p) => RANKING_TYPES.includes(p.type))
    .pop();
  const seedFromRanking = qualifyingPhase ? state.orders[qualifyingPhase.id] ?? [] : [];

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      {category.phases.map((phase) => {
        const isLocked = locked || phaseLocked(phase);

        return (
          <section className="panel stack" key={phase.id}>
            <div className="spread">
              <div>
                <p className="eyebrow">{category.name}</p>
                <h2>{phase.name}</h2>
              </div>
              <div className="row" style={{ gap: '0.35rem' }}>
                <span className="tag">{t(`rule.${phase.type}`)}</span>
                {phase.resolved && <span className="tag tag--done">{t('event.phase.resolved')}</span>}
                {isLocked && !phase.resolved && <span className="tag">{t('event.phase.closed')}</span>}
              </div>
            </div>

            {RANKING_TYPES.includes(phase.type) ? (
              <RankingBoard
                phase={phase}
                contenders={contenders}
                order={state.orders[phase.id] ?? []}
                locked={isLocked}
                onChange={(order) =>
                  update({ orders: { ...state.orders, [phase.id]: order } })
                }
              />
            ) : (
              <BracketBoard
                phase={phase}
                phaseBattles={phase.battles}
                contenders={contenders}
                event={event}
                picks={state.picks[phase.id] ?? {}}
                locked={isLocked}
                seedFromRanking={seedFromRanking}
                onChange={(picks) =>
                  update({ picks: { ...state.picks, [phase.id]: picks } })
                }
              />
            )}
          </section>
        );
      })}

    </div>
  );
}

/**
 * Reconstruit l'état local à partir de toutes mes versions.
 * Renvoie trois index : le contenu par version, la liste par catégorie, et la
 * version ouverte par défaut — la déposée s'il y en a une, sinon la plus
 * récemment modifiée.
 */
function readVersion(saved) {
  const orders = {};
  const picks = {};
  for (const r of [...saved.ranks].sort((a, b) => a.rank - b.rank)) {
    (orders[r.phaseId] ??= []).push(r.contenderId);
  }
  for (const b of saved.battles) {
    ((picks[b.phaseId] ??= {}))[key(b.round, b.slot)] = {
      phaseId: b.phaseId,
      round: b.round,
      slot: b.slot,
      contenderAId: b.contenderAId,
      contenderBId: b.contenderBId,
      winnerId: b.winnerId,
      scoreA: b.scoreA,
      scoreB: b.scoreB,
    };
  }
  return { orders, picks };
}

function hydrate({ event, myPredictions }) {
  const draft = {};
  const versions = {};
  const current = {};

  for (const category of event.categories) {
    const mine = myPredictions.filter((p) => p.categoryId === category.id);
    versions[category.id] = mine;
    for (const p of mine) draft[p.id] = readVersion(p);
    current[category.id] = (mine.find((p) => p.submitted) ?? mine[0])?.id ?? null;
  }

  return { draft, versions, current };
}