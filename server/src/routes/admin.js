import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession, isStaff } from '../lib/context.jsx';
import ArtistPhotosPanel from '../components/ArtistPhotosPanel.jsx';

const TABS = [
  ['events', 'Événements'],
  ['artists', 'Artistes'],
  ['results', 'Résultats'],
  ['people', 'Comptes'],
];

export default function Admin() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState('events');

  if (loading) return <p className="faint" style={{ marginTop: '2rem' }}>Chargement…</p>;
  if (!isStaff(user)) {
    return (
      <div className="empty" style={{ marginTop: '3rem' }}>
        Cette section est réservée aux comptes autorisés. Demandez un accès à un administrateur.
      </div>
    );
  }

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header>
        <p className="eyebrow">Connecté en tant que {user.role.toLowerCase()}</p>
        <h1>Administration</h1>
      </header>

      <nav className="row" style={{ borderBottom: 'var(--frame)', paddingBottom: '0.75rem', gap: '0.4rem' }}>
        {TABS.map(([id, label]) => (
          <button key={id} className={`btn${tab === id ? ' btn--primary' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'events' && <EventsAdmin />}
      {tab === 'artists' && <ArtistsAdmin />}
      {tab === 'results' && <ResultsAdmin />}
      {tab === 'people' && <PeopleAdmin currentUser={user} />}
    </div>
  );
}

function useFlash() {
  const [flash, setFlash] = useState(null);
  const run = async (fn, okText) => {
    try {
      await fn();
      setFlash({ ok: true, text: okText });
    } catch (e) {
      setFlash({ ok: false, text: e.message });
    }
  };
  const node = flash && (
    <p className={`notice${flash.ok ? ' notice--ok' : ''}`}>{flash.text}</p>
  );
  return [node, run];
}

// --- Événements ---------------------------------------------------------------

function EventsAdmin() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), location: '' });
  const [flash, run] = useFlash();

  const reload = () => api.get('/events').then(({ events }) => setEvents(events));
  useEffect(() => { reload(); }, []);

  return (
    <div className="stack">
      {flash}

      <section className="panel stack">
        <h2>Créer un événement</h2>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="ev-name">Nom</label>
            <input id="ev-name" type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grand Beatbox Battle" />
          </div>
          <div className="field">
            <label htmlFor="ev-year">Année</label>
            <input id="ev-year" type="number" value={form.year}
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} style={{ width: '6rem' }} />
          </div>
          <div className="field">
            <label htmlFor="ev-loc">Lieu</label>
            <input id="ev-loc" type="text" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Tokyo, Japon" />
          </div>
          <button
            className="btn btn--primary"
            disabled={!form.name}
            onClick={() =>
              run(async () => {
                await api.post('/admin/events', form);
                setForm({ name: '', year: new Date().getFullYear(), location: '' });
                await reload();
              }, 'Événement créé en brouillon.')
            }
          >
            Créer
          </button>
        </div>
      </section>

      <section className="stack">
        <h2>Événements existants</h2>
        <div className="panel panel--flush">
          <table>
            <thead>
              <tr><th>Nom</th><th>Catégories</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.name} {ev.year}</td>
                  <td className="muted">{ev.categories.map((c) => c.name).join(', ') || '—'}</td>
                  <td>
                    <select
                      value={ev.status}
                      onChange={(e) =>
                        run(async () => {
                          await api.patch(`/admin/events/${ev.id}`, { status: e.target.value });
                          await reload();
                        }, 'Statut mis à jour.')
                      }
                    >
                      <option value="DRAFT">Brouillon</option>
                      <option value="OPEN">Pronostics ouverts</option>
                      <option value="LIVE">En cours</option>
                      <option value="FINISHED">Terminé</option>
                    </select>
                  </td>
                  <td className="num">
                    <button
                      className="btn btn--small"
                      onClick={() => run(() => api.post(`/admin/events/${ev.id}/rescore`), 'Scores recalculés.')}
                    >
                      Recalculer les scores
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ fontSize: '0.85rem' }}>
          Catégories, participants et phases se créent via l'API <code className="data">/api/admin</code> ou
          le script de seed — c'est la partie la plus verbeuse, un formulaire dédié se greffe ici.
        </p>
      </section>
    </div>
  );
}

// --- Artistes -----------------------------------------------------------------

function ArtistsAdmin() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', country: '' });
  const [flash, run] = useFlash();

  const reload = () => api.get('/artists').then(({ artists }) => setArtists(artists));
  useEffect(() => { reload(); }, []);

  return (
    <div className="stack">
      {flash}
      <ArtistPhotosPanel onDone={reload} />
      <section className="panel stack">
        <h2>Ajouter un artiste</h2>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="ar-name">Nom de scène</label>
            <input id="ar-name" type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ar-country">Pays</label>
            <input id="ar-country" type="text" value={form.country} style={{ width: '6rem' }}
              onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="FR" />
          </div>
          <button
            className="btn btn--primary"
            disabled={!form.name}
            onClick={() =>
              run(async () => {
                await api.post('/admin/artists', { ...form, aliases: [] });
                setForm({ name: '', country: '' });
                await reload();
              }, 'Artiste ajouté.')
            }
          >
            Ajouter
          </button>
        </div>
        <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
          Un artiste créé ici est réutilisable sur tous les événements suivants.
        </p>
      </section>

      <div className="panel panel--flush">
        <table>
          <thead><tr><th>Nom</th><th>Pays</th><th></th></tr></thead>
          <tbody>
            {artists.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.country ?? '—'}</td>
                <td className="num">
                  <button
                    className="btn btn--small"
                    onClick={() =>
                      run(async () => { await api.del(`/admin/artists/${a.id}`); await reload(); }, 'Artiste supprimé.')
                    }
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Résultats ----------------------------------------------------------------

function ResultsAdmin() {
  const [events, setEvents] = useState([]);
  const [slug, setSlug] = useState('');
  const [detail, setDetail] = useState(null);
  const [flash, run] = useFlash();

  useEffect(() => { api.get('/events').then(({ events }) => { setEvents(events); setSlug(events[0]?.slug ?? ''); }); }, []);
  const reload = () => slug && api.get(`/events/${slug}`).then(setDetail);
  useEffect(() => { setDetail(null); reload(); }, [slug]);

  return (
    <div className="stack">
      {flash}
      <div className="field">
        <label htmlFor="res-ev">Événement</label>
        <select id="res-ev" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {events.map((ev) => <option key={ev.id} value={ev.slug}>{ev.name} {ev.year}</option>)}
        </select>
      </div>

      {!detail && <p className="faint">Chargement…</p>}

      {detail?.event.categories.map((cat) => (
        <section className="panel stack" key={cat.id}>
          <div className="spread">
            <h2>{cat.name}</h2>
            <button
              className="btn btn--small"
              onClick={() => run(() => api.post(`/admin/categories/${cat.id}/rescore`), 'Scores recalculés.')}
            >
              Recalculer
            </button>
          </div>

          {cat.phases.map((phase) => (
            <div key={phase.id} className="stack" style={{ gap: '0.6rem' }}>
              <h3>{phase.name}</h3>

              {['BRACKET', 'LEGACY'].includes(phase.type) ? (
                phase.battles.map((b) => (
                  <BattleResult key={b.id} battle={b} contenders={cat.contenders} onDone={reload} run={run} />
                ))
              ) : (
                <RankingResult phase={phase} contenders={cat.contenders} onDone={reload} run={run} />
              )}
            </div>
          ))}

        </section>
      ))}
    </div>
  );
}

function BattleResult({ battle, contenders, onDone, run }) {
  const [state, setState] = useState({
    contenderAId: battle.contenderAId ?? '',
    contenderBId: battle.contenderBId ?? '',
    winnerId: battle.winnerId ?? '',
    score: battle.scoreA == null ? '' : `${battle.scoreA}-${battle.scoreB}`,
  });

  const options = [{ id: '', name: '— non défini —' }, ...contenders];

  return (
    <div className="row" style={{ borderTop: 'var(--frame)', paddingTop: '0.6rem' }}>
      <span className="tag">{battle.round} #{battle.slot}</span>

      {['contenderAId', 'contenderBId'].map((field) => (
        <select key={field} value={state[field]} onChange={(e) => setState({ ...state, [field]: e.target.value })}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ))}

      <select value={state.winnerId} onChange={(e) => setState({ ...state, winnerId: e.target.value })}>
        <option value="">Vainqueur…</option>
        {[state.contenderAId, state.contenderBId].filter(Boolean).map((id) => (
          <option key={id} value={id}>{contenders.find((c) => c.id === id)?.name}</option>
        ))}
      </select>

      <select value={state.score} onChange={(e) => setState({ ...state, score: e.target.value })}>
        <option value="">Score…</option>
        {['3-0', '2-1', '1-2', '0-3', '5-0', '4-1', '3-2'].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <button
        className="btn btn--small btn--primary"
        onClick={() => {
          const [a, b] = state.score ? state.score.split('-').map(Number) : [null, null];
          run(async () => {
            await api.put(`/admin/battles/${battle.id}/result`, {
              contenderAId: state.contenderAId || null,
              contenderBId: state.contenderBId || null,
              winnerId: state.winnerId || null,
              scoreA: a, scoreB: b, played: Boolean(state.winnerId),
            });
            await onDone();
          }, 'Résultat enregistré, pronostics recalculés.');
        }}
      >
        Enregistrer
      </button>
    </div>
  );
}

function RankingResult({ phase, contenders, onDone, run }) {
  const initial = contenders.map((c) => {
    const e = phase.entries.find((x) => x.contenderId === c.id);
    return { contenderId: c.id, name: c.name, rank: e?.rank ?? '', qualified: e?.qualified ?? false };
  });
  const [rows, setRows] = useState(initial);

  return (
    <div className="stack" style={{ gap: '0.35rem' }}>
      {rows.map((r, i) => (
        <div className="row" key={r.contenderId}>
          <span style={{ minWidth: '12rem' }}>{r.name}</span>
          <input
            type="number" min="1" style={{ width: '5rem' }} value={r.rank}
            aria-label={`Place de ${r.name}`}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...r, rank: e.target.value === '' ? '' : Number(e.target.value) };
              setRows(next);
            }}
          />
          <label style={{ margin: 0 }}>
            <input
              type="checkbox" checked={r.qualified}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...r, qualified: e.target.checked };
                setRows(next);
              }}
            />{' '}
            qualifié
          </label>
        </div>
      ))}
      <div>
        <button
          className="btn btn--small btn--primary"
          onClick={() =>
            run(async () => {
              await api.put(`/admin/phases/${phase.id}/results`, {
                resolved: true,
                entries: rows.filter((r) => r.rank !== '').map(({ contenderId, rank, qualified }) => ({ contenderId, rank, qualified })),
              });
              await onDone();
            }, 'Classement enregistré, pronostics recalculés.')
          }
        >
          Publier le classement
        </button>
      </div>
    </div>
  );
}

// --- Comptes ------------------------------------------------------------------

function PeopleAdmin({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [flash, run] = useFlash();

  const reload = () => api.get(`/admin/users?q=${encodeURIComponent(q)}`).then(({ users }) => setUsers(users));
  useEffect(() => { reload(); }, [q]);

  return (
    <div className="stack">
      {flash}
      <div className="field">
        <label htmlFor="q">Chercher un compte Discord</label>
        <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="pseudo ou identifiant Discord" />
      </div>

      <div className="panel panel--flush">
        <table>
          <thead><tr><th>Compte</th><th>Identifiant Discord</th><th>Rôle</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="row" style={{ gap: '0.5rem' }}>
                    {u.avatarUrl && <img className="avatar" src={u.avatarUrl} alt="" />}
                    {u.globalName ?? u.username}
                  </span>
                </td>
                <td className="data faint">{u.discordId}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={u.id === currentUser.id}
                    onChange={(e) =>
                      run(async () => {
                        await api.patch(`/admin/users/${u.id}/role`, { role: e.target.value });
                        await reload();
                      }, 'Rôle mis à jour.')
                    }
                  >
                    <option value="USER">Membre</option>
                    <option value="MODERATOR">Modérateur</option>
                    <option value="ADMIN">Administrateur</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: '0.85rem' }}>
        Un modérateur saisit les résultats et gère les événements. Un administrateur peut en plus
        supprimer des éléments et distribuer les rôles.
      </p>
    </div>
  );
}