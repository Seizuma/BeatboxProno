import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import RankingBoard from '../components/RankingBoard.jsx';
import BracketBoard from '../components/BracketBoard.jsx';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const key = (round, slot) => `${round}:${slot}`;

export default function EventPage() {
  const { slug } = useParams();
  const { user } = useSession();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);

  // Brouillon local : { [categoryId]: { orders: {phaseId: [ids]}, picks: {phaseId: {..}}, podium: [ids] } }
  const [draft, setDraft] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((payload) => {
        setData(payload);
        setActiveId(payload.event.categories[0]?.id ?? null);
        setDraft(hydrate(payload));
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const category = useMemo(
    () => data?.event.categories.find((c) => c.id === activeId) ?? null,
    [data, activeId]
  );

  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>Chargement…</p>;

  const { event } = data;
  const state = draft[activeId] ?? { orders: {}, picks: {}, podium: [] };
  const eventClosed = event.status === 'FINISHED';

  const update = (patch) =>
    setDraft((d) => ({ ...d, [activeId]: { ...state, ...patch } }));

  const phaseLocked = (phase) =>
    eventClosed || phase.resolved || (phase.locksAt && new Date(phase.locksAt) <= new Date());

  async function save(submit) {
    setSaving(true);
    setFlash(null);
    try {
      const payload = {
        submit,
        ranks: Object.entries(state.orders).flatMap(([phaseId, ids]) =>
          ids.map((contenderId, i) => ({ phaseId, contenderId, rank: i + 1 }))
        ),
        battles: Object.values(state.picks).flatMap((byBattle) =>
          Object.values(byBattle).filter((b) => b.contenderAId && b.contenderBId)
        ),
        podium: state.podium
          .map((contenderId, i) => ({ rank: i + 1, contenderId }))
          .filter((p) => p.contenderId),
      };
      const res = await api.put(`/predictions/categories/${activeId}`, payload);
      setFlash({
        ok: true,
        text: res.note ?? (submit ? 'Pronostic déposé.' : 'Brouillon enregistré.'),
      });
    } catch (e) {
      setFlash({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ paddingTop: 'clamp(2rem, 5vw, 3.5rem)' }}>
      <header style={{ paddingBottom: '0.5rem' }}>
        <p className="silkscreen">
          {event.location ?? '—'}
          {event.startsAt && ` · ${new Date(event.startsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </p>
        <h1 className="hero__title" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4rem)' }}>
          {event.name} <em>{event.year}</em>
        </h1>
        {event.description && <p className="muted" style={{ maxWidth: '60ch' }}>{event.description}</p>}
      </header>

      <nav className="row" style={{ gap: '0.4rem', borderBottom: 'var(--frame)', paddingBottom: '0.75rem' }}>
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

      {!user && (
        <p className="notice">
          Connectez-vous avec Discord pour enregistrer un pronostic. Vous pouvez déjà tout
          parcourir et préparer vos choix, ils seront perdus au rechargement.
        </p>
      )}

      {category && (
        <CategoryEditor
          category={category}
          state={state}
          update={update}
          phaseLocked={phaseLocked}
          locked={eventClosed || !user}
        />
      )}

      {user && !eventClosed && (
        <div className="actionbar">
          <button className="btn" onClick={() => save(false)} disabled={saving}>
            Enregistrer le brouillon
          </button>
          <button className="btn btn--primary" onClick={() => save(true)} disabled={saving}>
            Déposer le pronostic
          </button>
          {flash && (
            <span className={flash.ok ? 'data' : 'data'} style={{ color: flash.ok ? 'var(--ok)' : 'var(--accent)' }}>
              {flash.text}
            </span>
          )}
          <span className="faint" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
            Modifiable tant que la phase n'est pas fermée.
          </span>
        </div>
      )}
    </div>
  );
}

function CategoryEditor({ category, state, update, phaseLocked, locked }) {
  const contenders = category.contenders;

  // Le classement de la dernière phase de qualification sert à composer l'arbre.
  const qualifyingPhase = [...category.phases]
    .filter((p) => RANKING_TYPES.includes(p.type))
    .pop();
  const seedFromRanking = qualifyingPhase ? state.orders[qualifyingPhase.id] ?? [] : [];

  return (
    <div className="stack">
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
                <span className="tag">{PHASE_RULE[phase.type]}</span>
                {phase.resolved && <span className="tag tag--done">Résultat connu</span>}
                {isLocked && !phase.resolved && <span className="tag">Fermée</span>}
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

      {category.kind !== 'LEGACY' && (
        <section className="panel stack">
          <div>
            <p className="eyebrow">14 points en jeu</p>
            <h2>Top 4 final</h2>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              5 points pour la première place, puis 4, 3 et 2.
            </p>
          </div>

          <div className="podium">
            {[1, 2, 3, 4].map((rank) => (
              <div className="podium__row" key={rank}>
                <span className="podium__place">{rank}</span>
                <span>
                  <select
                    disabled={locked}
                    value={state.podium[rank - 1] ?? ''}
                    onChange={(e) => {
                      const next = [...state.podium];
                      next[rank - 1] = e.target.value || undefined;
                      update({ podium: next });
                    }}
                    style={{ width: '100%', maxWidth: '22rem' }}
                  >
                    <option value="">Aucun choix</option>
                    {contenders.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <span className="podium__value"> vaut {[0, 5, 4, 3, 2][rank]} points</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const PHASE_RULE = {
  SEEDING: 'Écart de placement seul',
  WILDCARD: '+1 par qualifié, +1 à 5 par écart',
  ELIMINATION: '+1 par qualifié, +1 à 5 par écart',
  BRACKET: '+2 affiche, +2 vainqueur, +2 score',
  LEGACY: '+2 affiche, +2 vainqueur, +2 score',
};

/** Reconstruit le brouillon local à partir des pronostics déjà enregistrés. */
function hydrate({ event, myPredictions }) {
  const draft = {};
  for (const category of event.categories) {
    const saved = myPredictions.find((p) => p.categoryId === category.id);
    const orders = {};
    const picks = {};
    let podium = [];

    if (saved) {
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
      podium = [...saved.podium].sort((a, b) => a.rank - b.rank).map((p) => p.contenderId);
    }
    draft[category.id] = { orders, picks, podium };
  }
  return draft;
}
