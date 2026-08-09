import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import RankingBoard from '../components/RankingBoard.jsx';
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
  const state = draft[currentId] ?? { orders: {}, picks: {} };
  const eventClosed = event.status === 'FINISHED';

  const update = (patch) =>
    setDraft((d) => ({ ...d, [currentId]: { ...(d[currentId] ?? { orders: {}, picks: {} }), ...patch } }));

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

  /** Enregistre le contenu de la version ouverte. Ne dépose rien. */
  async function save() {
    if (!currentId) return;
    setSaving(true);
    setFlash(null);
    try {
      const payload = {
        ranks: Object.entries(state.orders).flatMap(([phaseId, ids]) =>
          ids.map((contenderId, i) => ({ phaseId, contenderId, rank: i + 1 }))
        ),
        battles: Object.values(state.picks).flatMap((byBattle) =>
          Object.values(byBattle).filter((b) => b.contenderAId && b.contenderBId)
        ),
      };
      const res = await api.put(`/predictions/${currentId}`, payload);
      await refreshVersions(activeId, currentId);
      setFlash({ ok: true, at: Date.now(), text: res.note ?? t('event.saved.draft') });
    } catch (e) {
      setFlash({ ok: false, at: Date.now(), text: e.message });
    } finally {
      setSaving(false);
    }
  }

  /** Dépose la version ouverte. Celle qui l'était redevient un brouillon. */
  async function submitCurrent() {
    if (!currentId) return;
    setSaving(true);
    setFlash(null);
    try {
      await save();
      const res = await api.post(`/predictions/${currentId}/submit`);
      await refreshVersions(activeId, currentId);
      setFlash({ ok: true, at: Date.now(), text: res.note ?? t('event.saved.submit') });
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
        {event.categories.map((c) => (
          <button
            key={c.id}
            className={`btn${c.id === activeId ? ' btn--primary' : ''}`}
            onClick={() => setActiveId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </nav>

      {!user && <p className="notice">{t('event.signin')}</p>}

      {user && category && !eventClosed && (
        <VersionBar
          versions={myVersions}
          currentId={currentId}
          max={10}
          busy={saving}
          onPick={(id) => setCurrent((c) => ({ ...c, [activeId]: id }))}
          onCreate={(copyFrom) =>
            versionAction(async () => {
              const { prediction } = await api.post(`/predictions/categories/${activeId}`, { copyFrom });
              await refreshVersions(activeId, prediction.id);
              return t('draft.created', { name: prediction.label });
            })
          }
          onRename={(label) =>
            versionAction(async () => {
              await api.patch(`/predictions/${currentId}`, { label });
              await refreshVersions(activeId, currentId);
              return t('draft.renamed');
            })
          }
          onDelete={() =>
            versionAction(async () => {
              await api.del(`/predictions/${currentId}`);
              const left = await refreshVersions(activeId, null);
              setCurrent((c) => ({ ...c, [activeId]: left[0]?.id ?? null }));
              return t('draft.deleted');
            })
          }
          onWithdraw={() =>
            versionAction(async () => {
              await api.post(`/predictions/${currentId}/withdraw`);
              await refreshVersions(activeId, currentId);
              return t('draft.withdrawn');
            })
          }
        />
      )}

      {category && (
        <CategoryEditor
          category={category}
          event={event}
          state={state}
          update={update}
          phaseLocked={phaseLocked}
          locked={eventClosed || !user || !currentId}
        />
      )}

      {user && !eventClosed && (
        <div className="actionbar">
          <button className="btn" onClick={save} disabled={saving || !currentId}>
            {saving ? t('event.saving') : t('event.save.draft')}
          </button>
          <button
            className="btn btn--primary"
            onClick={submitCurrent}
            disabled={saving || !currentId || activeVersion?.submitted}
          >
            {saving
              ? t('event.saving')
              : activeVersion?.submitted
                ? t('event.already.submitted')
                : t('event.save.submit')}
          </button>

          {/* La confirmation manquait : les boutons restaient identiques après
              l'enregistrement, et rien ne disait que c'était parti. */}
          {flash && (
            <span
              key={flash.at}
              className={`saved${flash.ok ? '' : ' saved--error'}`}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true">{flash.ok ? '✓' : '!'}</span> {flash.text}
            </span>
          )}
          <span className="faint" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
            {t('event.editable')}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * La barre des versions. Dix brouillons possibles, un seul pronostic déposé —
 * signalé par une pastille. Changer de version n'écrase rien : chacune vit sa
 * vie jusqu'à ce qu'on en dépose une.
 */
function VersionBar({ versions, currentId, max, busy, onPick, onCreate, onRename, onDelete, onWithdraw }) {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState('');

  const currentVersion = versions.find((v) => v.id === currentId) ?? null;
  const drafts = versions.filter((v) => !v.submitted).length;
  const atCap = drafts >= max;

  if (versions.length === 0) {
    return (
      <div className="versions">
        <p className="faint" style={{ margin: 0 }}>{t('draft.none')}</p>
        <button className="btn btn--primary btn--small" disabled={busy} onClick={() => onCreate()}>
          {t('draft.start')}
        </button>
      </div>
    );
  }

  return (
    <div className="versions">
      <span className="eyebrow" style={{ margin: 0 }}>{t('draft.title')}</span>

      <span className="versions__list">
        {versions.map((v) => (
          <button
            key={v.id}
            className={`btn btn--small${v.id === currentId ? ' btn--primary' : ''}`}
            onClick={() => onPick(v.id)}
            disabled={busy}
          >
            {v.submitted && <span aria-hidden="true">★ </span>}
            {v.label ?? t('draft.untitled')}
            {v.submitted && <span className="visually-hidden"> — {t('draft.submitted')}</span>}
          </button>
        ))}
      </span>

      <span className="versions__actions">
        <button
          className="btn btn--small"
          disabled={busy || atCap}
          title={atCap ? t('draft.cap', { max }) : undefined}
          onClick={() => onCreate()}
        >
          + {t('draft.new')}
        </button>
        <button className="btn btn--small" disabled={busy || atCap} onClick={() => onCreate(currentId)}>
          {t('draft.duplicate')}
        </button>
        <button
          className="btn btn--small"
          disabled={busy}
          onClick={() => {
            setLabel(currentVersion?.label ?? '');
            setRenaming(true);
          }}
        >
          {t('draft.rename')}
        </button>
        {currentVersion?.submitted ? (
          <button className="btn btn--small btn--ghost" disabled={busy} onClick={onWithdraw}>
            {t('draft.withdraw')}
          </button>
        ) : (
          <button
            className="btn btn--small btn--danger"
            disabled={busy || versions.length <= 1}
            onClick={onDelete}
          >
            {t('draft.delete')}
          </button>
        )}
        <span className="faint data" style={{ fontSize: '0.85rem' }}>
          {drafts}/{max}
        </span>
      </span>

      {renaming && (
        <span className="row" style={{ gap: '0.4rem', flexBasis: '100%' }}>
          <input
            type="text"
            value={label}
            maxLength={60}
            autoFocus
            aria-label={t('draft.rename')}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && label.trim()) {
                onRename(label.trim());
                setRenaming(false);
              }
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
          <button
            className="btn btn--small btn--primary"
            disabled={!label.trim()}
            onClick={() => {
              onRename(label.trim());
              setRenaming(false);
            }}
          >
            {t('draft.rename.ok')}
          </button>
          <button className="btn btn--small btn--ghost" onClick={() => setRenaming(false)}>
            {t('draft.cancel')}
          </button>
        </span>
      )}
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