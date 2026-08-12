import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession, isStaff, isOwner } from '../lib/context.jsx';
import ArtistPhotosPanel from '../components/ArtistPhotosPanel.jsx';
import Modal from '../components/Modal.jsx';
import ArtistFigure from '../components/ArtistFigure.jsx';
import { splitsForWinner, judgesFor, scoreMatchesWinner } from '../lib/scores.js';
import { shrinkImage, humanSize } from '../lib/image.js';
import ConfirmDelete from '../components/ConfirmDelete.jsx';
import PhotoCompare from '../components/PhotoCompare.jsx';
import OrphanContenders from '../components/OrphanContenders.jsx';

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

/**
 * Toute suppression passe par ici. `ask(kind, id, done)` ouvre la fenêtre de
 * bilan ; rien n'est envoyé au serveur tant que l'administrateur n'a pas relu
 * ce que l'action emporte et cliqué. Les routes refusent de toute façon sans
 * `?confirm=true` : l'interface et l'API tiennent la même ligne.
 */
function useConfirmDelete() {
  const [pending, setPending] = useState(null);

  const ask = (kind, id, onDone) => setPending({ kind, id, onDone });

  const node = pending && (
    <ConfirmDelete
      kind={pending.kind}
      id={pending.id}
      onCancel={() => setPending(null)}
      onConfirmed={async (result) => {
        setPending(null);
        await pending.onDone?.(result);
      }}
    />
  );

  return [node, ask];
}

function useFlash() {
  const [flash, setFlash] = useState(null);
  const run = async (fn, okText) => {
    try {
      // Une action peut renvoyer son propre message quand elle en sait plus
      // que l'appelant — par exemple le poids gagné après réduction d'image.
      const text = await fn();
      setFlash({ ok: true, text: text ?? okText });
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
  const [confirmNode, askDelete] = useConfirmDelete();

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
      {confirmNode}

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
              <tr><th></th><th>Nom</th><th>Catégories</th><th>Statut</th><th className="num">Pronos</th><th></th></tr>
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
                  <td className="num">
                    <button
                      className="btn btn--small btn--danger"
                      onClick={() =>
                        askDelete('event', ev.id, async () => {
                          if (selected === ev.id) setSelected('');
                          await reload();
                          await run(async () => { }, `${ev.name} ${ev.year} supprimé.`);
                        })
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
      </section>

      {selected && !detail && <p className="faint">Chargement de la structure…</p>}
      {selected && detail && (
        <EventStructure event={detail.event} onDone={refresh} run={run} askDelete={askDelete} />
      )}
    </div>
  );
}

function EventStructure({ event, onDone, run, askDelete }) {
  const [building, setBuilding] = useState(false);

  return (
    <section className="stack">
      <EventSettings event={event} onDone={onDone} run={run} />
      <div className="spread">
        <h2>Structure — {event.name} {event.year}</h2>
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="silkscreen">{event.categories.length} catégorie(s)</span>
          <button className="btn btn--primary btn--small" onClick={() => setBuilding(true)}>
            Paramétrer le format
          </button>
        </div>
      </div>

      {event.categories.length === 0 && (
        <p className="empty">
          Aucune catégorie. Ouvrez « Paramétrer le format » pour composer l'événement.
        </p>
      )}

      {event.categories.map((cat) => (
        <CategoryPanel key={cat.id} category={cat} onDone={onDone} run={run} askDelete={askDelete} />
      ))}

      {building && (
        <FormatBuilder
          event={event}
          run={run}
          onClose={() => setBuilding(false)}
          onDone={async () => { await onDone(); setBuilding(false); }}
        />
      )}
    </section>
  );
}

/**
 * Les réglages d'un événement : nombre de juges et date butoir.
 *
 * La date est volontairement facultative. Une compète dont les wildcards sont
 * ouvertes mais dont la date n'est pas fixée n'a pas de butoir — laisser le
 * champ vide, c'est dire « rien ne ferme globalement, seules les phases se
 * verrouillent ». Le bouton Effacer y revient.
 */
function EventSettings({ event, onDone, run }) {
  // <input type="datetime-local"> attend « AAAA-MM-JJTHH:MM » en heure locale.
  const toLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [judges, setJudges] = useState(event.judgeCount ?? 3);
  const [closeAt, setCloseAt] = useState(toLocal(event.predictionsCloseAt));

  const save = (patch) =>
    run(async () => {
      await api.patch(`/admin/events/${event.id}`, patch);
      await onDone();
    }, 'Réglages enregistrés.');

  return (
    <div className="panel stack" style={{ gap: '0.7rem' }}>
      <h3>Réglages</h3>

      <div className="row" style={{ alignItems: 'flex-end', gap: '1rem' }}>
        <div className="field">
          <label htmlFor={`judges-${event.id}`}>Nombre de juges</label>
          <select
            id={`judges-${event.id}`}
            value={judges}
            onChange={(e) => {
              const n = Number(e.target.value);
              setJudges(n);
              save({ judgeCount: n });
            }}
          >
            {[1, 3, 5, 7, 9].map((n) => (
              <option key={n} value={n}>{n} juges</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`close-${event.id}`}>Date butoir des pronostics</label>
          <input
            id={`close-${event.id}`}
            type="datetime-local"
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
          />
        </div>

        <button
          className="btn btn--small btn--primary"
          disabled={closeAt === toLocal(event.predictionsCloseAt)}
          onClick={() => save({ predictionsCloseAt: new Date(closeAt).toISOString() })}
        >
          Enregistrer la date
        </button>

        <button
          className="btn btn--small btn--ghost"
          disabled={!event.predictionsCloseAt}
          onClick={() => {
            setCloseAt('');
            save({ predictionsCloseAt: null });
          }}
        >
          Effacer
        </button>
      </div>

      <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
        {event.predictionsCloseAt
          ? "Passé cette date, plus aucun pronostic n'est enregistrable sur l'événement."
          : "Aucune date butoir : les pronostics restent ouverts tant que les phases ne sont pas verrouillées. C'est le réglage à garder tant que la date de la compète n'est pas connue."}
        {' '}Les {judges} juges déterminent les scores proposés aux pronostiqueurs.
      </p>
    </div>
  );
}

function CategoryPanel({ category, onDone, run, askDelete }) {
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
            className="btn btn--small btn--danger"
            onClick={() =>
              askDelete('category', category.id, async () => {
                await onDone();
                await run(async () => { }, `${category.name} supprimée.`);
              })
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

      {open && <ContenderManager category={category} onDone={onDone} run={run} askDelete={askDelete} />}
    </div>
  );
}

/** Ajout et retrait des participants — jusqu'ici réservé au script de seed. */
function ContenderManager({ category, onDone, run, askDelete }) {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', seed: '', artistId: '' });
  // Les artistes déjà engagés dans cette catégorie n'ont plus à être proposés.
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { api.get('/artists').then(({ artists }) => setArtists(artists)).catch(() => { }); }, []);

  const nextSeed = category.contenders.length + 1;

  // Déjà engagés : on les écarte de la liste plutôt que de laisser créer un
  // doublon dans la même catégorie.
  const engaged = new Set(
    category.contenders.flatMap((c) => (c.artists ?? []).map((l) => l.artist?.id ?? l.artistId))
  );

  /**
   * Le sélecteur ne propose que les artistes typés dans ce format. Les non
   * typés sont écartés eux aussi : tant qu'ils sont majoritaires, les laisser
   * revient à ne pas filtrer du tout.
   *
   * La case « tout afficher » reste le recours quand quelqu'un manque — et le
   * message en dessous dit combien d'artistes attendent d'être qualifiés.
   */
  const available = artists.filter((a) => !engaged.has(a.id));
  const suggested = showAll
    ? available
    : available.filter((a) => (a.kinds ?? []).includes(category.kind));

  const untyped = available.filter((a) => (a.kinds ?? []).length === 0).length;
  const hidden = available.length - suggested.length;

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
            <option value="">— créer d'après le nom —</option>
            {suggested.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {showAll && (a.kinds ?? []).length === 0 ? ' (non typé)' : ''}
              </option>
            ))}
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

        {hidden > 0 && (
          <label style={{ margin: 0, textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />{' '}
            <span className="faint" style={{ fontSize: '0.84rem' }}>
              Afficher les {hidden} autre(s) artiste(s)
            </span>
          </label>
        )}
      </div>

      <p className="faint" style={{ fontSize: '0.84rem', margin: 0 }}>
        Le sélecteur ne propose que les artistes typés «{' '}
        {ARTIST_KINDS.find(([id]) => id === category.kind)?.[1] ?? category.kind} ».
        {untyped > 0 && (
          <>
            {' '}
            <strong>{untyped} artiste(s) ne sont pas encore typés</strong> et n'apparaissent donc
            pas : qualifiez-les depuis l'onglet Artistes, filtre « Non typés ».
          </>
        )}{' '}
        Sans artiste sélectionné, un artiste est créé d'après le nom saisi — ou réutilisé s'il
        existe déjà : un participant n'est jamais laissé sans fiche, c'est ce qui garantit sa photo
        et sa page.
      </p>

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
                        className="btn btn--small btn--danger"
                        onClick={() =>
                          askDelete('contender', c.id, async () => {
                            await onDone();
                            await run(async () => { }, `${c.name} retiré.`);
                          })
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
function FormatBuilder({ event, onDone, onClose, run }) {
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

  const footer = (
    <>
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
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      {mode === 'replace' && (
        <span className="faint" style={{ fontSize: '0.82rem' }}>
          Refusé si des pronostics existent déjà.
        </span>
      )}
    </>
  );

  return (
    <Modal
      wide
      title="Paramétrer le format"
      subtitle={`${event.name} ${event.year}`}
      onClose={onClose}
      footer={catalog ? footer : null}
    >
      {!catalog ? (
        <p className="faint">Chargement des formats…</p>
      ) : (
        <>
          <p className="faint" style={{ fontSize: '0.88rem', margin: 0 }}>
            Cochez les catégories de l'événement. Chacune reçoit ses phases et son
            squelette d'affiches ; les participants s'ajoutent ensuite, catégorie
            par catégorie.
          </p>

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

          {chosen.length === 0 && (
            <p className="empty" style={{ padding: '1rem' }}>
              Aucune catégorie cochée pour l'instant.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

// =============================================================================
//  ARTISTES
// =============================================================================

const ARTIST_KINDS = [
  ['SOLO', 'Solo'],
  ['TAG_TEAM', 'Tag Team'],
  ['LOOPSTATION', 'Loopstation'],
  ['CREW', 'Crew'],
  ['PRODUCER', 'Producer'],
];

/**
 * Une ligne d'artiste modifiable : nom, pays, formats pratiqués.
 *
 * Renommer se répercute partout — fiches, arbres, pronostics déjà déposés —
 * puisque les participants ne recopient plus le nom au moment de l'engagement.
 * L'ancien nom part dans les alias, pour que l'appariement des photos continue
 * de reconnaître les fichiers existants.
 */
function ArtistRow({ artist, onDone, run, askDelete, picked, onPick }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: artist.name,
    country: artist.country ?? '',
    kinds: artist.kinds ?? [],
  });

  const toggleKind = (id) =>
    setForm((f) => ({
      ...f,
      kinds: f.kinds.includes(id) ? f.kinds.filter((k) => k !== id) : [...f.kinds, id],
    }));

  const save = () =>
    run(async () => {
      await api.patch(`/admin/artists/${artist.id}`, {
        name: form.name.trim(),
        country: form.country.trim() || null,
        kinds: form.kinds,
      });
      setEditing(false);
      await onDone();
      return form.name.trim() !== artist.name
        ? `« ${artist.name} » renommé en « ${form.name.trim()} » partout sur le site.`
        : 'Artiste mis à jour.';
    });

  if (editing) {
    return (
      <tr>
        <td />
        <td><ArtistFigure src={artist.imageUrl} name={artist.name} size="sm" /></td>
        <td>
          <input
            type="text"
            value={form.name}
            aria-label="Nom de l'artiste"
            style={{ width: '11rem' }}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </td>
        <td>
          <input
            type="text"
            value={form.country}
            aria-label="Pays"
            style={{ width: '4.5rem' }}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </td>
        <td>
          <span className="row" style={{ gap: '0.25rem' }}>
            {ARTIST_KINDS.map(([id, label]) => (
              <button
                key={id}
                className={`btn btn--small${form.kinds.includes(id) ? ' btn--primary' : ''}`}
                onClick={() => toggleKind(id)}
              >
                {label}
              </button>
            ))}
          </span>
        </td>
        <td className="num">
          <span className="row" style={{ gap: '0.3rem', justifyContent: 'flex-end' }}>
            <button className="btn btn--small btn--primary" disabled={!form.name.trim()} onClick={save}>
              Enregistrer
            </button>
            <button className="btn btn--small btn--ghost" onClick={() => setEditing(false)}>
              Annuler
            </button>
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={picked}
          aria-label={`Sélectionner ${artist.name}`}
          onChange={(e) => onPick(e.target.checked)}
        />
      </td>
      <td><ArtistFigure src={artist.imageUrl} name={artist.name} size="sm" /></td>
      <td>{artist.name}</td>
      <td className="muted">{artist.country ?? '—'}</td>
      <td>
        <span className="row" style={{ gap: '0.25rem' }}>
          {(artist.kinds ?? []).length === 0 ? (
            <span className="faint data" style={{ fontSize: '0.8rem' }}>non typé</span>
          ) : (
            artist.kinds.map((k) => (
              <span className="tag" key={k}>
                {ARTIST_KINDS.find(([id]) => id === k)?.[1] ?? k}
              </span>
            ))
          )}
        </span>
      </td>
      <td className="num">
        <span className="row" style={{ gap: '0.35rem', justifyContent: 'flex-end' }}>
          <button className="btn btn--small" onClick={() => setEditing(true)}>Modifier</button>
          <PhotoUpload artist={artist} onDone={onDone} run={run} />
          <button
            className="btn btn--small btn--danger"
            onClick={() =>
              askDelete('artist', artist.id, async (result) => {
                await onDone();
                await run(
                  async () =>
                    result?.removedContenders
                      ? `${artist.name} supprimé, ${result.removedContenders} participant(s) retiré(s).`
                      : `${artist.name} supprimé.`
                );
              })
            }
          >
            Supprimer
          </button>
        </span>
      </td>
    </tr>
  );
}

function ArtistsAdmin() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', country: '', kinds: [] });
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [flash, run] = useFlash();
  const [confirmNode, askDelete] = useConfirmDelete();

  const reload = () => api.get('/artists').then(({ artists }) => setArtists(artists));
  useEffect(() => { reload(); }, []);

  const shown = artists.filter((a) => {
    if (!a.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (!kind) return true;
    if (kind === 'none') return (a.kinds ?? []).length === 0;
    return (a.kinds ?? []).includes(kind);
  });

  return (
    <div className="stack">
      {flash}
      {confirmNode}
      <OrphanContenders onDone={reload} />
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
          <div className="field">
            <label>Formats</label>
            <span className="row" style={{ gap: '0.25rem' }}>
              {ARTIST_KINDS.map(([id, label]) => (
                <button
                  key={id}
                  className={`btn btn--small${form.kinds.includes(id) ? ' btn--primary' : ''}`}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      kinds: f.kinds.includes(id)
                        ? f.kinds.filter((k) => k !== id)
                        : [...f.kinds, id],
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          <button
            className="btn btn--primary"
            disabled={!form.name}
            onClick={() =>
              run(async () => {
                await api.post('/admin/artists', { ...form, aliases: [] });
                setForm({ name: '', country: '', kinds: [] });
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

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="ar-q">Filtrer</label>
          <input id="ar-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un nom" />
        </div>
        <div className="field">
          <label htmlFor="ar-kind">Format</label>
          <select id="ar-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Tous</option>
            {ARTIST_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            <option value="none">Non typés</option>
          </select>
        </div>
        <span className="faint data" style={{ fontSize: '0.85rem' }}>{shown.length} artiste(s)</span>
      </div>

      {/* Typage en masse : après l'introduction des formats, une base
          existante compte des dizaines d'artistes à qualifier. */}
      {picked.size > 0 && (
        <div className="panel row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <span className="data">{picked.size} sélectionné(s) — typer comme :</span>
          {ARTIST_KINDS.map(([id, label]) => (
            <button
              key={id}
              className="btn btn--small"
              onClick={() =>
                run(async () => {
                  const { updated } = await api.post('/admin/artists/bulk-kinds', {
                    ids: [...picked],
                    kinds: [id],
                    mode: 'add',
                  });
                  setPicked(new Set());
                  await reload();
                  return `${updated} artiste(s) typé(s) « ${label} ».`;
                })
              }
            >
              {label}
            </button>
          ))}
          <button className="btn btn--small btn--ghost" onClick={() => setPicked(new Set())}>
            Désélectionner
          </button>
        </div>
      )}

      <div className="panel panel--flush">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={shown.length > 0 && shown.every((a) => picked.has(a.id))}
                  onChange={(e) =>
                    setPicked(e.target.checked ? new Set(shown.map((a) => a.id)) : new Set())
                  }
                />
              </th>
              <th>Photo</th><th>Nom</th><th>Pays</th><th>Formats</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <ArtistRow
                key={a.id}
                artist={a}
                onDone={reload}
                run={run}
                askDelete={askDelete}
                picked={picked.has(a.id)}
                onPick={(on) =>
                  setPicked((p) => {
                    const next = new Set(p);
                    if (on) next.add(a.id);
                    else next.delete(a.id);
                    return next;
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/**
 * Envoi d'une photo pour un artiste. Le fichier part brut, avec son type MIME :
 * le serveur vérifie la signature binaire et range l'image dans le volume
 * dédié, puis met à jour l'artiste. La photo apparaît partout sur le site
 * aussitôt — fiches, arbres, classements — puisque tout lit `imageUrl`.
 */
function PhotoUpload({ artist, onDone, run }) {
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const inputId = `photo-${artist.id}`;

  const send = async (file) => {
    if (!file) return;

    // Une photo existe déjà : on la met face à la nouvelle avant de trancher.
    // Rien n'est envoyé tant que le choix n'est pas fait — la réduction se
    // fera dans la fenêtre de comparaison.
    if (artist.imageUrl) return setCandidate(file);

    setBusy(true);
    await run(async () => {
      // Une photo de scène pèse plusieurs mégaoctets pour un affichage en
      // 96 px : on la réduit avant de l'envoyer.
      const { file: payload, resized, from, to } = await shrinkImage(file);
      if (payload.size > 8 * 1024 * 1024) {
        throw new Error(
          `${file.name} pèse encore ${humanSize(payload.size)} après réduction. Maximum : 8 Mo.`
        );
      }
      await api.upload(`/admin/photos/upload/${artist.id}`, payload);
      await onDone();
      return resized
        ? `Photo de ${artist.name} ajoutée (${humanSize(from)} → ${humanSize(to)}).`
        : `Photo de ${artist.name} ajoutée.`;
    }, `Photo de ${artist.name} ajoutée.`);
    setBusy(false);
  };

  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="visually-hidden"
        onChange={(e) => {
          send(e.target.files?.[0]);
          e.target.value = ''; // pour pouvoir renvoyer le même fichier
        }}
      />
      <label htmlFor={inputId} className="btn btn--small" style={{ cursor: 'pointer', margin: 0 }}>
        {busy ? 'Envoi…' : artist.imageUrl ? 'Remplacer' : 'Ajouter une photo'}
      </label>
      {artist.imageUrl && (
        <button
          className="btn btn--small btn--ghost"
          title="Retirer la photo"
          onClick={() =>
            run(async () => {
              await api.del(`/admin/photos/upload/${artist.id}`);
              await onDone();
            }, `Photo de ${artist.name} retirée.`)
          }
        >
          ✕
        </button>
      )}

      {candidate && (
        <PhotoCompare
          artist={artist}
          file={candidate}
          onCancel={() => setCandidate(null)}
          onReplaced={async () => {
            setCandidate(null);
            await onDone();
            await run(async () => { }, `Photo de ${artist.name} remplacée.`);
          }}
        />
      )}
    </>
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
          <BracketResults
            key={phase.id}
            phase={phase}
            event={detail.event}
            contenders={category.contenders}
            onDone={reload}
            run={run}
          />
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
function BracketResults({ phase, event, contenders, onDone, run }) {
  // Le panel de juges de la phase, ou celui de l'événement à défaut.
  const judges = judgesFor(phase, event);
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
                        onClick={() => {
                          const next = r.winnerId === id ? '' : id;
                          const side = next ? (next === r.contenderAId ? 'a' : 'b') : null;
                          const [sa, sb] = r.score ? r.score.split('-').map(Number) : [null, null];
                          // Un score qui donnait l'autre gagnant n'a plus de sens.
                          patch(b.id, {
                            winnerId: next,
                            score: next && scoreMatchesWinner(sa, sb, side) ? r.score : '',
                          });
                        }}
                      >
                        {nameOf(id)}
                      </button>
                    ))}
                  </span>

                  {/* Sans vainqueur, pas de score à saisir. */}
                  {r.winnerId && (
                    <select
                      value={r.score}
                      aria-label={`Score de l'affiche ${b.slot + 1}`}
                      style={{ width: '6.5rem' }}
                      onChange={(e) => patch(b.id, { score: e.target.value })}
                    >
                      <option value="">Score…</option>
                      {splitsForWinner(
                        judges,
                        r.winnerId === r.contenderAId ? 'a' : 'b'
                      ).map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  )}
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
                    // Un administrateur ne peut pas toucher au propriétaire, et
                    // personne ne se retire ses propres droits.
                    disabled={u.id === currentUser.id || (u.role === 'OWNER' && !isOwner(currentUser))}
                    aria-label={`Rôle de ${u.username}`}
                    onChange={(e) =>
                      run(async () => {
                        await api.patch(`/admin/users/${u.id}/role`, { role: e.target.value });
                        await reload();
                      }, 'Rôle mis à jour.')
                    }
                  >
                    <option value="USER">Membre</option>
                    <option value="ADMIN">Administrateur</option>
                    {/* Seul le propriétaire peut transmettre son rang ; le
                        serveur refuse de toute façon les autres cas. */}
                    {isOwner(currentUser) && <option value="OWNER">Propriétaire</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: '0.85rem' }}>
        Un administrateur gère les événements, les artistes et les résultats, et distribue les
        rôles. Le propriétaire est le seul qu'aucun administrateur ne peut destituer ; il n'y en a
        qu'un, et il ne peut transmettre son rang qu'en le donnant à quelqu'un d'autre.
      </p>
    </div>
  );
}