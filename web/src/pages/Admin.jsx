import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession, isStaff } from '../lib/context.jsx';
import ArtistPhotosPanel from '../components/ArtistPhotosPanel.jsx';

const TABS = [
  ['structure', 'Événements'],
  ['artists', 'Artistes'],
  ['results', 'Résultats'],
  ['people', 'Comptes'],
];

export default function Admin() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState('structure');

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

      {tab === 'structure' && <StructureAdmin />}
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
  const node = flash && <p className={`notice${flash.ok ? ' notice--ok' : ''}`}>{flash.text}</p>;
  return [node, run];
}

/** Petit bandeau d'avancement : « 5/8 » avec une jauge. */
function Progress({ done, total }) {
  if (!total) return <span className="faint data">—</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <span className="data" title={`${done} sur ${total}`}>
      <span style={{ color: done === total ? 'var(--ok)' : 'var(--accent)' }}>
        {done}/{total}
      </span>
      <span className="meter" style={{ width: '4rem', display: 'inline-block', marginLeft: '0.4rem' }}>
        <span style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

// =============================================================================
//  ÉVÉNEMENTS & STRUCTURE
// =============================================================================

function StructureAdmin() {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), location: '' });
  const [flash, run] = useFlash();

  const reload = async () => {
    const { events } = await api.get('/events');
    setEvents(events);
    return events;
  };
  useEffect(() => { reload(); }, []);

  const reloadDetail = async (list = events) => {
    const ev = list.find((e) => e.id === selected);
    if (!ev) return setDetail(null);
    setDetail(await api.get(`/events/${ev.slug}`));
  };
  useEffect(() => { setDetail(null); reloadDetail(); }, [selected, events.length]);

  const refresh = async () => {
    const list = await reload();
    await reloadDetail(list);
  };

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
            <input id="ev-year" type="number" value={form.year} style={{ width: '6rem' }}
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
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
                const { event } = await api.post('/admin/events', form);
                setForm({ name: '', year: new Date().getFullYear(), location: '' });
                await reload();
                setSelected(event.id);
              }, 'Événement créé en brouillon. Composez sa structure ci-dessous.')
            }
          >
            Créer
          </button>
        </div>
      </section>

      <section className="stack">
        <h2>Événements</h2>
        <div className="panel panel--flush">
          <table>
            <thead>
              <tr><th></th><th>Nom</th><th>Catégories</th><th>Statut</th><th className="num">Pronos</th></tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <button
                      className={`btn btn--small${selected === ev.id ? ' btn--primary' : ''}`}
                      onClick={() => setSelected(selected === ev.id ? '' : ev.id)}
                    >
                      {selected === ev.id ? 'Fermer' : 'Composer'}
                    </button>
                  </td>
                  <td>{ev.name} {ev.year}</td>
                  <td className="muted">{ev.categories.map((c) => c.name).join(' · ') || '—'}</td>
                  <td>
                    <select
                      value={ev.status}
                      aria-label={`Statut de ${ev.name}`}
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
                  <td className="num">{ev._count?.predictions ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && !detail && <p className="faint">Chargement de la structure…</p>}
      {selected && detail && <EventStructure event={detail.event} onDone={refresh} run={run} />}
    </div>
  );
}

function EventStructure({ event, onDone, run }) {
  return (
    <section className="stack">
      <div className="spread">
        <h2>Structure — {event.name} {event.year}</h2>
        <span className="silkscreen">{event.categories.length} catégorie(s)</span>
      </div>

      {event.categories.length === 0 && (
        <p className="empty">Aucune catégorie. Composez le format ci-dessous.</p>
      )}

      {event.categories.map((cat) => (
        <CategoryPanel key={cat.id} category={cat} onDone={onDone} run={run} />
      ))}

      <FormatBuilder event={event} onDone={onDone} run={run} />
    </section>
  );
}

function CategoryPanel({ category, onDone, run }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="panel stack" style={{ gap: '0.6rem' }}>
      <div className="spread">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{category.kind}</p>
          <h3>{category.name}</h3>
        </div>
        <div className="row" style={{ gap: '0.4rem' }}>
          <span className="tag">{category.contenders.length} participants</span>
          <button className="btn btn--small" onClick={() => setOpen(!open)}>
            {open ? 'Réduire' : 'Participants'}
          </button>
          <button
            className="btn btn--small btn--ghost"
            onClick={() =>
              run(async () => {
                await api.del(`/admin/categories/${category.id}`);
                await onDone();
              }, 'Catégorie supprimée.')
            }
          >
            Supprimer
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: '0.35rem' }}>
        {category.phases.map((p) => (
          <span className={`tag${p.resolved ? ' tag--done' : ''}`} key={p.id}>
            {p.name}
            {p.qualifierCount ? ` · ${p.qualifierCount} qualifiés` : ''}
            {p.battles?.length ? ` · ${p.battles.length} affiches` : ''}
          </span>
        ))}
      </div>

      {open && <ContenderManager category={category} onDone={onDone} run={run} />}
    </div>
  );
}

/** Ajout et retrait des participants — jusqu'ici réservé au script de seed. */
function ContenderManager({ category, onDone, run }) {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', seed: '', artistId: '' });

  useEffect(() => { api.get('/artists').then(({ artists }) => setArtists(artists)).catch(() => { }); }, []);

  const nextSeed = category.contenders.length + 1;

  const add = () =>
    run(async () => {
      await api.post(`/admin/categories/${category.id}/contenders`, {
        name: form.name || artists.find((a) => a.id === form.artistId)?.name || '',
        seed: form.seed === '' ? nextSeed : Number(form.seed),
        artistIds: form.artistId ? [form.artistId] : [],
      });
      setForm({ name: '', seed: '', artistId: '' });
      await onDone();
    }, 'Participant ajouté.');

  return (
    <div className="stack" style={{ gap: '0.5rem', borderTop: 'var(--frame)', paddingTop: '0.7rem' }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor={`ct-artist-${category.id}`}>Artiste</label>
          <select
            id={`ct-artist-${category.id}`}
            value={form.artistId}
            onChange={(e) => {
              const a = artists.find((x) => x.id === e.target.value);
              setForm({ ...form, artistId: e.target.value, name: a?.name ?? form.name });
            }}
          >
            <option value="">— libre —</option>
            {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`ct-name-${category.id}`}>Nom affiché</label>
          <input
            id={`ct-name-${category.id}`} type="text" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Alem, ou « Colaps & Zekka »"
          />
        </div>
        <div className="field">
          <label htmlFor={`ct-seed-${category.id}`}>Seed</label>
          <input
            id={`ct-seed-${category.id}`} type="number" min="1" style={{ width: '5rem' }}
            value={form.seed} placeholder={String(nextSeed)}
            onChange={(e) => setForm({ ...form, seed: e.target.value })}
          />
        </div>
        <button className="btn btn--primary btn--small" disabled={!form.name && !form.artistId} onClick={add}>
          Ajouter
        </button>
      </div>

      {category.contenders.length > 0 && (
        <div className="panel panel--flush">
          <table>
            <thead><tr><th className="num">Seed</th><th>Nom</th><th></th></tr></thead>
            <tbody>
              {[...category.contenders]
                .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
                .map((c) => (
                  <tr key={c.id}>
                    <td className="num">{c.seed ?? '—'}</td>
                    <td>{c.name}</td>
                    <td className="num">
                      <button
                        className="btn btn--small btn--ghost"
                        onClick={() =>
                          run(async () => {
                            await api.del(`/admin/contenders/${c.id}`);
                            await onDone();
                          }, 'Participant retiré.')
                        }
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Le constructeur de format. On coche les catégories voulues, on choisit la
 * taille du tableau pour chacune, et le serveur monte phases et squelette
 * d'affiches d'un seul geste.
 */
function FormatBuilder({ event, onDone, run }) {
  const [catalog, setCatalog] = useState(null);
  const [picked, setPicked] = useState({});
  const [mode, setMode] = useState('add');

  useEffect(() => { api.get('/admin/formats').then(setCatalog).catch(() => { }); }, []);

  const existingKinds = new Set(event.categories.map((c) => c.kind));

  const toggle = (kind, label) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[kind]) delete next[kind];
      else next[kind] = { kind, name: label, format: 'TOP_8', wildcard: false, wildcardCount: '', smallFinal: false };
      return next;
    });

  const patch = (kind, changes) => setPicked((p) => ({ ...p, [kind]: { ...p[kind], ...changes } }));

  const chosen = Object.values(picked);

  const submit = () =>
    run(async () => {
      await api.post(`/admin/events/${event.id}/format`, {
        mode,
        categories: chosen.map((c) => ({
          kind: c.kind,
          name: c.name,
          format: c.format,
          wildcard: c.wildcard,
          wildcardCount: c.wildcardCount === '' ? null : Number(c.wildcardCount),
          smallFinal: c.smallFinal,
        })),
      });
      setPicked({});
      await onDone();
    }, 'Structure générée.');

  if (!catalog) return <p className="faint">Chargement des formats…</p>;

  return (
    <div className="panel stack">
      <div>
        <h3>Composer le format</h3>
        <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
          Chaque catégorie cochée reçoit ses phases et son squelette d'affiches.
          Les participants s'ajoutent ensuite, catégorie par catégorie.
        </p>
      </div>

      <div className="row" style={{ gap: '0.4rem' }}>
        {catalog.kinds.map((k) => (
          <button
            key={k.id}
            className={`btn btn--small${picked[k.id] ? ' btn--primary' : ''}`}
            onClick={() => toggle(k.id, k.label)}
          >
            {k.label}{existingKinds.has(k.id) ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {chosen.length > 0 && (
        <div className="panel panel--flush">
          <table>
            <thead>
              <tr><th>Catégorie</th><th>Tableau</th><th>Qualifications</th><th>3e place</th></tr>
            </thead>
            <tbody>
              {chosen.map((c) => (
                <tr key={c.kind}>
                  <td>
                    <input
                      type="text" value={c.name} aria-label={`Nom de la catégorie ${c.kind}`}
                      onChange={(e) => patch(c.kind, { name: e.target.value })}
                      style={{ width: '10rem' }}
                    />
                  </td>
                  <td>
                    <select
                      value={c.format} aria-label={`Format de ${c.name}`}
                      onChange={(e) => patch(c.kind, { format: e.target.value })}
                    >
                      {catalog.brackets.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label style={{ margin: 0 }}>
                      <input
                        type="checkbox" checked={c.wildcard}
                        onChange={(e) => patch(c.kind, { wildcard: e.target.checked })}
                      />{' '}
                      wildcards
                    </label>
                    {c.wildcard && (
                      <input
                        type="number" min="2" style={{ width: '5rem', marginLeft: '0.5rem' }}
                        value={c.wildcardCount}
                        aria-label={`Nombre de qualifiés pour ${c.name}`}
                        placeholder={String(catalog.brackets.find((b) => b.id === c.format)?.size ?? '')}
                        onChange={(e) => patch(c.kind, { wildcardCount: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox" checked={c.smallFinal}
                      disabled={c.format === 'TOP_2'}
                      aria-label={`Petite finale pour ${c.name}`}
                      onChange={(e) => patch(c.kind, { smallFinal: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="fmt-mode">Mode</label>
          <select id="fmt-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="add">Ajouter aux catégories existantes</option>
            <option value="replace">Remplacer toute la structure</option>
          </select>
        </div>
        <button className="btn btn--primary" disabled={chosen.length === 0} onClick={submit}>
          Générer la structure
        </button>
        {mode === 'replace' && (
          <span className="faint" style={{ fontSize: '0.82rem' }}>
            Le remplacement refuse de partir si des pronostics existent déjà.
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
//  ARTISTES
// =============================================================================

function ArtistsAdmin() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', country: '' });
  const [q, setQ] = useState('');
  const [flash, run] = useFlash();

  const reload = () => api.get('/artists').then(({ artists }) => setArtists(artists));
  useEffect(() => { reload(); }, []);

  const shown = artists.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

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

      <div className="field">
        <label htmlFor="ar-q">Filtrer</label>
        <input id="ar-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un nom" />
      </div>

      <div className="panel panel--flush">
        <table>
          <thead><tr><th>Nom</th><th>Pays</th><th></th></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.country ?? '—'}</td>
                <td className="num">
                  <button
                    className="btn btn--small btn--ghost"
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

// =============================================================================
//  RÉSULTATS
//  Une phase à la fois. La navigation se fait par onglets, l'avancement se lit
//  d'un coup d'œil, et la publication part en un seul envoi par phase —
//  l'ancien enregistrement affiche par affiche relançait le calcul de toute la
//  catégorie à chaque clic.
// =============================================================================

const ROUND_LABELS = {
  ROUND_OF_16: 'Huitièmes',
  QUARTER: 'Quarts',
  SEMI: 'Demi-finales',
  SMALL_FINAL: 'Petite finale',
  FINAL: 'Finale',
  LEGACY: 'Legacy',
};
const ROUND_ORDER = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];
const SCORES = ['3-0', '2-1', '1-2', '0-3', '5-0', '4-1', '3-2'];

function ResultsAdmin() {
  const [events, setEvents] = useState([]);
  const [slug, setSlug] = useState('');
  const [detail, setDetail] = useState(null);
  const [catId, setCatId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [flash, run] = useFlash();

  useEffect(() => {
    api.get('/events').then(({ events }) => { setEvents(events); setSlug(events[0]?.slug ?? ''); });
  }, []);

  const reload = async () => {
    if (!slug) return null;
    const data = await api.get(`/events/${slug}`);
    setDetail(data);
    return data;
  };
  useEffect(() => { setDetail(null); setCatId(''); setPhaseId(''); reload(); }, [slug]);

  const categories = detail?.event.categories ?? [];
  const category = categories.find((c) => c.id === catId) ?? categories[0] ?? null;
  const phases = category?.phases ?? [];
  const phase = phases.find((p) => p.id === phaseId) ?? phases[0] ?? null;

  return (
    <div className="stack">
      {flash}

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="res-ev">Événement</label>
          <select id="res-ev" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {events.map((ev) => <option key={ev.id} value={ev.slug}>{ev.name} {ev.year}</option>)}
          </select>
        </div>
        {category && (
          <button
            className="btn btn--small"
            onClick={() => run(() => api.post(`/admin/categories/${category.id}/rescore`), 'Scores recalculés.')}
          >
            Recalculer {category.name}
          </button>
        )}
      </div>

      {!detail && <p className="faint">Chargement…</p>}
      {detail && categories.length === 0 && (
        <p className="empty">Cet événement n'a pas encore de catégorie. Composez-le dans l'onglet Événements.</p>
      )}

      {categories.length > 0 && (
        <nav className="row" style={{ gap: '0.4rem' }}>
          {categories.map((c) => {
            const done = c.phases.filter((p) => p.resolved).length;
            return (
              <button
                key={c.id}
                className={`btn btn--small${c.id === category?.id ? ' btn--primary' : ''}`}
                onClick={() => { setCatId(c.id); setPhaseId(''); }}
              >
                {c.name} <span className="data">({done}/{c.phases.length})</span>
              </button>
            );
          })}
        </nav>
      )}

      {category && phases.length > 0 && (
        <nav className="row" style={{ gap: '0.4rem', borderBottom: 'var(--frame)', paddingBottom: '0.6rem' }}>
          {phases.map((p) => (
            <button
              key={p.id}
              className={`btn btn--small${p.id === phase?.id ? ' btn--primary' : ''}`}
              onClick={() => setPhaseId(p.id)}
            >
              {p.resolved ? '● ' : '○ '}{p.name}
            </button>
          ))}
        </nav>
      )}

      {category && phase && (
        ['BRACKET', 'LEGACY'].includes(phase.type) ? (
          <BracketResults key={phase.id} phase={phase} contenders={category.contenders} onDone={reload} run={run} />
        ) : (
          <RankingResults key={phase.id} phase={phase} contenders={category.contenders} onDone={reload} run={run} />
        )
      )}
    </div>
  );
}

/**
 * Saisie d'un tableau. Tout l'état reste local jusqu'à la publication : on
 * remplit tranquillement, on envoie une fois. Le vainqueur se désigne en
 * cliquant sur le nom, pas dans une liste déroulante.
 */
function BracketResults({ phase, contenders, onDone, run }) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      phase.battles.map((b) => [
        b.id,
        {
          contenderAId: b.contenderAId ?? '',
          contenderBId: b.contenderBId ?? '',
          winnerId: b.winnerId ?? '',
          score: b.scoreA == null ? '' : `${b.scoreA}-${b.scoreB}`,
        },
      ])
    )
  );

  const byRound = useMemo(() => {
    const map = {};
    for (const b of phase.battles) (map[b.round] ??= []).push(b);
    for (const list of Object.values(map)) list.sort((x, y) => x.slot - y.slot);
    return ROUND_ORDER.filter((r) => map[r]).map((r) => [r, map[r]]);
  }, [phase.battles]);

  const nameOf = (id) => contenders.find((c) => c.id === id)?.name ?? '—';
  const patch = (id, changes) => setRows((r) => ({ ...r, [id]: { ...r[id], ...changes } }));

  const filled = phase.battles.filter((b) => rows[b.id]?.winnerId).length;

  const publish = (resolved) =>
    run(async () => {
      await api.put(`/admin/phases/${phase.id}/battles`, {
        resolved,
        battles: phase.battles.map((b) => {
          const r = rows[b.id];
          const [sa, sb] = r.score ? r.score.split('-').map(Number) : [null, null];
          return {
            id: b.id,
            contenderAId: r.contenderAId || null,
            contenderBId: r.contenderBId || null,
            winnerId: r.winnerId || null,
            scoreA: sa,
            scoreB: sb,
            played: Boolean(r.winnerId),
          };
        }),
      });
      await onDone();
    }, resolved === false ? 'Phase rouverte.' : resolved ? 'Phase publiée, pronostics recalculés.' : 'Résultats enregistrés.');

  return (
    <div className="stack">
      <div className="panel spread">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{phase.type}</p>
          <h2>{phase.name}</h2>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          <Progress done={filled} total={phase.battles.length} />
          <button className="btn btn--small" onClick={() => publish(undefined)}>Enregistrer</button>
          <button className="btn btn--small btn--primary" onClick={() => publish(true)}>Publier la phase</button>
          {phase.resolved && (
            <button className="btn btn--small btn--ghost" onClick={() => publish(false)}>Rouvrir</button>
          )}
        </div>
      </div>

      {byRound.map(([round, battles]) => (
        <details className="panel" key={round} open>
          <summary style={{ cursor: 'pointer' }}>
            <span className="eyebrow">{ROUND_LABELS[round] ?? round}</span>{' '}
            <span className="data faint">
              {battles.filter((b) => rows[b.id]?.winnerId).length}/{battles.length}
            </span>
          </summary>

          <div className="stack" style={{ gap: '0.4rem', marginTop: '0.7rem' }}>
            {battles.map((b) => {
              const r = rows[b.id];
              const both = [r.contenderAId, r.contenderBId].filter(Boolean);
              return (
                <div
                  key={b.id}
                  className="row"
                  style={{ gap: '0.4rem', borderTop: '1px solid var(--line)', paddingTop: '0.45rem' }}
                >
                  <span className="tag" style={{ minWidth: '2.5rem' }}>#{b.slot + 1}</span>

                  {['contenderAId', 'contenderBId'].map((field) => (
                    <select
                      key={field}
                      value={r[field]}
                      aria-label={`${field === 'contenderAId' ? 'Premier' : 'Second'} participant, affiche ${b.slot + 1}`}
                      style={{ maxWidth: '11rem' }}
                      onChange={(e) => {
                        const next = { [field]: e.target.value };
                        // Un vainqueur qui n'est plus dans l'affiche n'a plus lieu d'être.
                        const pair =
                          field === 'contenderAId'
                            ? [e.target.value, r.contenderBId]
                            : [r.contenderAId, e.target.value];
                        if (r.winnerId && !pair.includes(r.winnerId)) next.winnerId = '';
                        patch(b.id, next);
                      }}
                    >
                      <option value="">— non défini —</option>
                      {contenders.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ))}

                  <span className="row" style={{ gap: '0.25rem' }}>
                    {both.length === 0 && <span className="faint data">choisissez les participants</span>}
                    {both.map((id) => (
                      <button
                        key={id}
                        className={`btn btn--small${r.winnerId === id ? ' btn--primary' : ''}`}
                        onClick={() => patch(b.id, { winnerId: r.winnerId === id ? '' : id })}
                      >
                        {nameOf(id)}
                      </button>
                    ))}
                  </span>

                  <select
                    value={r.score}
                    aria-label={`Score de l'affiche ${b.slot + 1}`}
                    disabled={!r.winnerId}
                    style={{ width: '6.5rem' }}
                    onChange={(e) => patch(b.id, { score: e.target.value })}
                  >
                    <option value="">Score…</option>
                    {SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

/** Saisie d'un classement, avec numérotation assistée. */
function RankingResults({ phase, contenders, onDone, run }) {
  const [rows, setRows] = useState(() =>
    contenders.map((c) => {
      const e = phase.entries?.find((x) => x.contenderId === c.id);
      return {
        contenderId: c.id,
        name: c.name,
        seed: c.seed,
        rank: e?.rank ?? '',
        qualified: e?.qualified ?? false,
      };
    })
  );

  const patch = (i, changes) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...changes } : row)));

  const ranked = rows.filter((r) => r.rank !== '').length;
  const cut = phase.qualifierCount ?? null;

  /** Numérote dans l'ordre des seeds, et coche les qualifiés jusqu'à la coupe. */
  const fillFromSeed = () => {
    const ordered = [...rows].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
    const rankById = new Map(ordered.map((r, i) => [r.contenderId, i + 1]));
    setRows(
      rows.map((r) => {
        const rank = rankById.get(r.contenderId);
        return { ...r, rank, qualified: cut ? rank <= cut : r.qualified };
      })
    );
  };

  /** Coche les qualifiés d'après les places déjà saisies. */
  const syncQualified = () =>
    setRows(rows.map((r) => ({ ...r, qualified: cut && r.rank !== '' ? r.rank <= cut : r.qualified })));

  return (
    <div className="stack">
      <div className="panel spread">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            {phase.type}{cut ? ` · ${cut} qualifiés` : ''}
          </p>
          <h2>{phase.name}</h2>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          <Progress done={ranked} total={rows.length} />
          <button className="btn btn--small" onClick={fillFromSeed}>Numéroter par seed</button>
          {cut && <button className="btn btn--small" onClick={syncQualified}>Cocher les qualifiés</button>}
          <button
            className="btn btn--small btn--primary"
            onClick={() =>
              run(async () => {
                await api.put(`/admin/phases/${phase.id}/results`, {
                  resolved: true,
                  entries: rows
                    .filter((r) => r.rank !== '')
                    .map(({ contenderId, rank, qualified }) => ({ contenderId, rank: Number(rank), qualified })),
                });
                await onDone();
              }, 'Classement publié, pronostics recalculés.')
            }
          >
            Publier le classement
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">Aucun participant dans cette catégorie.</p>
      ) : (
        <div className="panel panel--flush">
          <table>
            <thead>
              <tr><th className="num">Seed</th><th>Participant</th><th className="num">Place</th><th>Qualifié</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.contenderId}>
                  <td className="num muted">{r.seed ?? '—'}</td>
                  <td>{r.name}</td>
                  <td className="num">
                    <input
                      type="number" min="1" style={{ width: '4.5rem' }} value={r.rank}
                      aria-label={`Place de ${r.name}`}
                      onChange={(e) => patch(i, { rank: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox" checked={r.qualified}
                      aria-label={`${r.name} qualifié`}
                      onChange={(e) => patch(i, { qualified: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
//  COMPTES
// =============================================================================

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
                    aria-label={`Rôle de ${u.username}`}
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