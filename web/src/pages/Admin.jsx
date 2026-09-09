import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession, isStaff } from '../lib/context.jsx';
import ArtistPhotosPanel from '../components/ArtistPhotosPanel.jsx';
import Modal from '../components/Modal.jsx';
import ArtistFigure from '../components/ArtistFigure.jsx';
import { splitsForWinner, judgesFor, scoreMatchesWinner } from '../lib/scores.js';
import { shrinkImage, humanSize } from '../lib/image.js';
import MenuButton from '../components/MenuButton.jsx';
import { seedFromContenders } from '../lib/bracket.js';
// Une catégorie sans tableau ne doit pas se voir proposer des tailles de
// tableau. La règle se lit dans la STRUCTURE — une phase unique de type
// WILDCARD — et non dans un drapeau enregistré, qui peut mentir.
import { isWildcardCategory, MIN_PLACES, MAX_PLACES } from '../lib/wildcard.js';
import RankingBoard from '../components/RankingBoard.jsx';
import BracketBoard from '../components/BracketBoard.jsx';
import SeedingEditor from '../components/SeedingEditor.jsx';
import CategoryFormat from '../components/CategoryFormat.jsx';
import ConfirmDelete from '../components/ConfirmDelete.jsx';
import PhotoCompare from '../components/PhotoCompare.jsx';
import OrphanContenders from '../components/OrphanContenders.jsx';
import AdminPeople from '../components/AdminPeople.jsx';
import AdminSearch from '../components/AdminSearch.jsx';
import AdminStats from '../components/AdminStats.jsx';
import EventExclusions from '../components/EventExclusions.jsx';
import EventSettlement from '../components/EventSettlement.jsx';
import { SET_LIST } from '../lib/badgeSets.js';
import ExportEvent from '../components/ExportEvent.jsx';

/**
 * Les espaces de l'administration, rangés par SUJET.
 *
 * ─── Ce qui était dispersé ──────────────────────────────────────────────────
 *
 * La suppression d'un pronostic vivait dans un onglet « Recherche », le
 * bannissement d'un compte dans « Comptes ». Deux gestes qui répondent au même
 * signalement, dans deux endroits que rien ne reliait : on cherchait la
 * sanction là où on avait trouvé la preuve, et elle n'y était pas.
 *
 * Symétriquement, « Comptes » s'ouvrait sur la courbe de fréquentation du site,
 * qui ne parle pas des comptes mais du site — on venait voir si une annonce
 * avait porté et on tombait sur cent personnes à administrer.
 *
 * ─── Le rangement ───────────────────────────────────────────────────────────
 *
 * Trois espaces pour la compétition, dans l'ordre où on les traverse : on monte
 * l'événement, on référence les artistes, on saisit les résultats.
 *
 * Un espace pour les personnes, qui réunit tout ce qui s'applique à quelqu'un —
 * son compte d'un côté, ses pronostics de l'autre.
 *
 * Un espace pour les chiffres, qui ne demandent aucune action et n'ont donc
 * rien à faire au milieu d'écrans où l'on agit.
 */
const TABS = [
  ['structure', 'Événements'],
  ['artists', 'Artistes'],
  ['results', 'Résultats'],
  ['players', 'Joueurs'],
  ['stats', 'Statistiques'],
];

/**
 * Les deux volets de l'espace « Joueurs ».
 *
 * Une personne se traite par son compte ou par ses pronostics ; ce sont deux
 * lectures du même sujet, pas deux sujets. D'où une navigation secondaire
 * plutôt que deux onglets de premier rang, qui auraient éloigné à nouveau ce
 * qu'on vient de rapprocher.
 */
const PLAYER_VIEWS = [
  ['accounts', 'Comptes'],
  // Retrouver qui a pronostiqué quoi, et le supprimer le cas échéant : l'outil
  // de support qu'on ouvre quand quelqu'un signale un incident ou conteste un
  // score.
  ['predictions', 'Pronostics'],
];

export default function Admin() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState('structure');
  const [playerView, setPlayerView] = useState('accounts');

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
      {tab === 'stats' && <AdminStats />}

      {tab === 'players' && (
        <div className="stack">
          {/* Navigation secondaire, visuellement plus légère que celle du haut :
              elle range à l'intérieur d'un sujet, elle n'en change pas. */}
          <nav className="row" style={{ gap: '0.4rem' }}>
            {PLAYER_VIEWS.map(([id, label]) => (
              <button
                key={id}
                className={`btn btn--small${playerView === id ? ' btn--primary' : ' btn--ghost'}`}
                aria-pressed={playerView === id}
                onClick={() => setPlayerView(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          {playerView === 'accounts' && <AdminPeople currentUser={user} useFlash={useFlash} />}
          {playerView === 'predictions' && <AdminSearch />}
        </div>
      )}
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

      // Une CHAÎNE, et rien d'autre. Passer `api.post(...)` directement à `run`
      // faisait remonter ici la réponse JSON de l'API ; React refuse un objet
      // comme enfant, lève, et fait tomber TOUT l'écran d'administration —
      // écran noir, sans message, sur un bouton qui avait pourtant réussi.
      // Le garde vaut mieux que la discipline : il protège aussi les appels
      // qu'on écrira demain.
      setFlash({ ok: true, text: typeof text === 'string' ? text : okText });
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
  // L'événement dont on prépare l'affiche d'annonce. Un état distinct de la
  // sélection de composition : on peut vouloir l'affiche sans ouvrir la
  // structure.
  const [announcing, setAnnouncing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), location: '' });
  const [flash, run] = useFlash();
  const [confirmNode, askDelete] = useConfirmDelete();
  // Le changement de statut en attente de confirmation.
  const [closing, setClosing] = useState(null);

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
                      onChange={(e) => {
                        const next = e.target.value;
                        // Passer « en cours » ou « terminé » ferme les
                        // pronostics : on ne le fait pas par inadvertance en
                        // parcourant une liste déroulante.
                        if (['LIVE', 'FINISHED'].includes(next) && !['LIVE', 'FINISHED'].includes(ev.status)) {
                          setClosing({ event: ev, status: next });
                          return;
                        }
                        run(async () => {
                          const { announced } = await api.patch(`/admin/events/${ev.id}`, {
                            status: next,
                          });
                          await reload();

                          // Une diffusion à tout le site ne doit pas se
                          // produire en silence.
                          if (announced?.sent) {
                            return `Statut mis à jour. Ouverture annoncée à ${announced.sent} compte(s).`;
                          }
                          if (announced?.skipped) {
                            return 'Statut mis à jour. Ouverture déjà annoncée : rien renvoyé.';
                          }
                          return 'Statut mis à jour.';
                        });
                      }}
                    >
                      <option value="DRAFT">Brouillon</option>
                      <option value="OPEN">Pronostics ouverts</option>
                      <option value="LIVE">En cours</option>
                      <option value="FINISHED">Terminé</option>
                    </select>
                  </td>
                  <td className="num">{ev._count?.predictions ?? 0}</td>
                  <td className="num">
                    <MenuButton
                      label={`Actions pour ${ev.name}`}
                      items={[
                        // L'affiche d'annonce n'a de sens qu'une fois les
                        // pronostics ouverts.
                        ev.status === 'OPEN' && {
                          label: "Affiche d'annonce",
                          onClick: () => setAnnouncing(ev.slug),
                        },
                        {
                          label: "Supprimer l'événement",
                          danger: true,
                          onClick: () =>
                            askDelete('event', ev.id, async () => {
                              if (selected === ev.id) setSelected('');
                              await reload();
                              await run(async () => `${ev.name} ${ev.year} supprimé.`);
                            }),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {announcing && (
        <ExportEvent slug={announcing} onClose={() => setAnnouncing(null)} />
      )}

      {selected && !detail && <p className="faint">Chargement de la structure…</p>}
      {selected && detail && (
        <EventStructure event={detail.event} onDone={refresh} run={run} askDelete={askDelete} />
      )}

      {/* Fermer les pronostics engage : on le confirme plutôt que de le
          déclencher au passage dans une liste déroulante. */}
      {closing && (
        <Modal
          title="Fermer les pronostics ?"
          subtitle={`${closing.event.name} ${closing.event.year}`}
          onClose={() => setClosing(null)}
          footer={
            <>
              <button
                className="btn btn--danger"
                onClick={() =>
                  run(async () => {
                    const { settled } = await api.patch(`/admin/events/${closing.event.id}`, {
                      status: closing.status,
                    });
                    setClosing(null);
                    await reload();

                    /* La distribution d'un palmarès ne doit pas se produire en
                       silence, et son ABSENCE encore moins : un organisateur qui
                       clôture sans rien voir se passer croit à une panne. Les
                       deux refus possibles ont chacun leur phrase. */
                    if (settled?.skipped === 'aucun-resultat') {
                      return 'Pronostics fermés. Aucun palmarès : rien n’est encore publié. Publiez les résultats puis repassez par « terminé ».';
                    }
                    if (settled?.skipped === 'rien-a-distribuer') {
                      return 'Pronostics fermés. Cette compète ne décerne ni badge ni crédit.';
                    }
                    if (settled?.badges || settled?.credits) {
                      const parts = [];
                      if (settled.badges) parts.push(`${settled.badges} badge(s)`);
                      if (settled.credits) parts.push(`le crédit de ${settled.credits} joueur(s)`);
                      return `Pronostics fermés. Distribué : ${parts.join(' et ')}.`;
                    }
                    return 'Pronostics fermés.';
                  })
                }
              >
                {closing.status === 'LIVE' ? 'Passer en cours' : 'Marquer terminé'}
              </button>
              <button className="btn" onClick={() => setClosing(null)}>Annuler</button>
            </>
          }
        >
          <p className="notice" style={{ margin: 0 }}>
            Plus aucun pronostic ne pourra être déposé ni modifié sur cet événement.
          </p>
          <p style={{ margin: 0 }}>
            {closing.status === 'LIVE'
              ? 'La compétition commence : les brouillons des joueurs restent enregistrés, mais seuls les pronostics déjà déposés compteront.'
              : "L'événement est terminé : le classement final est figé."}
          </p>
          <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
            Réversible : repasser l'événement en « Pronostics ouverts » les rouvre.
          </p>
        </Modal>
      )}
    </div>
  );
}

function EventStructure({ event, onDone, run, askDelete }) {
  const [building, setBuilding] = useState(false);

  return (
    <section className="stack">
      <EventSettings event={event} onDone={onDone} run={run} />

      {/* Les comptes écartés vivent avec l'événement, pas avec le compte : la
          mesure ne vaut QUE pour cette compète, et c'est en la préparant qu'on
          y pense. Le panneau est replié — on l'ouvre trois fois par saison. */}
      <EventExclusions event={event} run={run} />

      {/* Le palmarès distribué par la clôture. À côté des exclusions parce que
          les deux répondent à la même envie — défaire quelque chose sur CETTE
          compète — et qu'aucun des deux ne se cherche ailleurs. */}
      <EventSettlement event={event} run={run} />

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

      {/* Le palmarès : DEUX réglages, et c'est le point.

          Un seul booléen commandait les médailles et le crédit ensemble : pour
          se débarrasser des unes, il fallait renoncer à l'autre. Un championnat
          peut parfaitement rapporter des points de boutique sans décerner les
          médailles d'une autre compétition.

          Et les badges appartiennent désormais à une FAMILLE de dessins,
          choisie par la compète — « aucune » étant un choix comme un autre. */}
      <div className="stack" style={{ gap: '0.5rem' }}>
        <div className="field" style={{ margin: 0, maxWidth: '22rem' }}>
          <label htmlFor={`badgeset-${event.id}`}>Jeu de badges décerné</label>
          <select
            id={`badgeset-${event.id}`}
            value={event.badgeSet ?? ''}
            onChange={(e) => save({ badgeSet: e.target.value || null })}
          >
            <option value="">Aucun badge</option>
            {SET_LIST.map((set) => (
              <option key={set.id} value={set.id}>{set.label}</option>
            ))}
          </select>
        </div>

        <label className="row" style={{ gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={event.awardsCredits !== false}
            onChange={(e) => save({ awardsCredits: e.target.checked })}
          />
          <span>Crédite le porte-monnaie</span>
        </label>

        <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
          Les deux sont indépendants : une compète peut rapporter des points de boutique sans
          décerner de médaille. Le jeu de badges décide de QUELS dessins tombent — chaque famille
          a les siens, et « aucun » veut dire que cette compète n'en donne pas.
        </p>
        <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
          Changer ces réglages ne touche pas à ce qui a déjà été distribué. Pour l'appliquer,
          utilisez « Recalculer le palmarès » dans le panneau ci-dessous : la clôture est rejouable
          et nettoie ce qui n'a plus lieu d'être.
        </p>
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
  /**
   * Le jury, saisi comme une liste separee par des virgules.
   *
   * Un champ unique plutot qu'une liste de champs a ajouter un par un : un
   * panel se recopie depuis une affiche ou un communique, et le coller d'un
   * bloc est le geste reel. Le decoupage se fait a l'enregistrement.
   */
  const [judges, setJudges] = useState((category.judges ?? []).join(', '));
  // Le tirage réglé, s'il y en a un d'ouvert. Un seul à la fois : deux tableaux
  // ouverts côte à côte n'aideraient personne à s'y retrouver.
  const [seeding, setSeeding] = useState(null);
  // Le format se replie par défaut : on ne retouche pas la forme d'un tableau
  // tous les jours, et déplié en permanence il noierait le jury et le tirage.
  const [format, setFormat] = useState(false);

  // Un tirage ne concerne qu'un tableau, et seulement une fois ses affiches
  // créées : sans elles, il n'y a rien à apparier.
  const brackets = category.phases.filter(
    (p) => ['BRACKET', 'LEGACY'].includes(p.type) && (p.battles?.length ?? 0) > 0
  );

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
            className={`btn btn--small${format ? ' btn--primary' : ''}`}
            aria-expanded={format}
            onClick={() => setFormat(!format)}
          >
            Format
          </button>
          <MenuButton
            label={`Actions pour ${category.name}`}
            items={[
              {
                label: 'Supprimer la catégorie',
                danger: true,
                onClick: () =>
                  askDelete('category', category.id, async () => {
                    await onDone();
                    await run(async () => `${category.name} supprimée.`);
                  }),
              },
            ]}
          />
        </div>
      </div>

      {/* Le jury de la categorie. Par categorie et non par evenement : une meme
          compete juge rarement le Solo et le Loopstation avec le meme panel. */}
      <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 22rem', margin: 0 }}>
          <label htmlFor={`judges-${category.id}`}>Jury (separe par des virgules)</label>
          <input
            id={`judges-${category.id}`}
            value={judges}
            placeholder="Alem, NaPoM, Kaila Mullady"
            onChange={(e) => setJudges(e.target.value)}
          />
        </div>
        <button
          className="btn btn--small"
          onClick={() =>
            run(async () => {
              // Decoupage a l'enregistrement : blancs retires et entrees vides
              // ecartees, pour qu'une virgule en trop ne cree pas un juge sans
              // nom.
              const list = judges
                .split(',')
                .map((n) => n.trim())
                .filter(Boolean);
              await api.patch(`/admin/categories/${category.id}`, { judges: list });
              await onDone();
              return list.length
                ? `Jury de ${category.name} : ${list.length} nom(s).`
                : `Jury de ${category.name} efface.`;
            })
          }
        >
          Enregistrer le jury
        </button>
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

      {/* Le tirage est une décision de STRUCTURE — qui affronte qui au premier
          tour — pas une saisie de résultat. Sa place est ici, à côté du format,
          et non dans l'écran où l'on enregistre ce qui s'est passé. */}
      {brackets.length > 0 && (
        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
          {brackets.map((p) => (
            <button
              key={p.id}
              className={`btn btn--small${seeding === p.id ? ' btn--primary' : ''}`}
              onClick={() => setSeeding(seeding === p.id ? null : p.id)}
            >
              Tirage — {p.name}
            </button>
          ))}
        </div>
      )}

      {seeding && (
        <SeedingEditor
          key={seeding}
          phase={brackets.find((p) => p.id === seeding)}
          onDone={onDone}
          run={run}
        />
      )}

      {format && <CategoryFormat category={category} onDone={onDone} run={run} />}

      {open && <ContenderManager category={category} onDone={onDone} run={run} askDelete={askDelete} />}
    </div>
  );
}

/** Ajout et retrait des participants — jusqu'ici réservé au script de seed. */
function ContenderManager({ category, onDone, run, askDelete }) {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', seed: '', artistId: '' });

  useEffect(() => { api.get('/artists').then(({ artists }) => setArtists(artists)).catch(() => { }); }, []);

  const nextSeed = category.contenders.length + 1;

  // Déjà engagés : on les écarte de la liste plutôt que de laisser créer un
  // doublon dans la même catégorie.
  const engaged = new Set(
    category.contenders.flatMap((c) => (c.artists ?? []).map((l) => l.artist?.id ?? l.artistId))
  );

  /**
   * Le sélecteur ne propose que les artistes typés dans ce format, et pas déjà
   * engagés ici. Un artiste qui manque se règle dans l'onglet Artistes, en lui
   * donnant le bon format — pas en contournant le filtre.
   */
  const suggested = artists.filter(
    (a) => !engaged.has(a.id) && (a.kinds ?? []).includes(category.kind)
  );

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
              <option key={a.id} value={a.id}>{a.name}</option>
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
                      <MenuButton
                        label={`Actions pour ${c.name}`}
                        items={[
                          {
                            label: 'Retirer de la catégorie',
                            danger: true,
                            onClick: () =>
                              askDelete('contender', c.id, async () => {
                                await onDone();
                                await run(async () => `${c.name} retiré.`);
                              }),
                          },
                        ]}
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

  /**
   * Cocher une entrée.
   *
   * La clé est l'IDENTIFIANT du catalogue et non la discipline : « Wildcard
   * Solo », « Solo Mixte » et « Solo Femme » portent toutes le kind SOLO, et
   * les indexer par kind les ferait s'écraser l'une l'autre.
   */
  const toggle = (entry) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[entry.id]) delete next[entry.id];
      else
        next[entry.id] = {
          id: entry.id,
          kind: entry.kind,
          name: entry.label,
          wildcardOnly: Boolean(entry.wildcardOnly),
          // Une sélection : un nombre de places, et rien d'autre.
          places: entry.wildcardOnly ? 8 : '',
          format: 'TOP_8',
          // Le palier d'éliminations reste ; celui de wildcards a disparu des
          // catégories à tableau — une sélection est désormais un événement à
          // part entière, pas une phase greffée sur autre chose.
          elimination: false,
          eliminationCount: '',
          smallFinal: false,
        };
      return next;
    });

  const patch = (id, changes) => setPicked((p) => ({ ...p, [id]: { ...p[id], ...changes } }));

  const chosen = Object.values(picked);

  const submit = () =>
    run(async () => {
      await api.post(`/admin/events/${event.id}/format`, {
        mode,
        categories: chosen.map((c) => ({
          kind: c.kind,
          name: c.name,
          wildcardOnly: c.wildcardOnly,
          ...(c.wildcardOnly
            ? { places: Math.min(100, Math.max(1, Number(c.places) || 1)) }
            : {
              format: c.format,
              elimination: c.elimination,
              eliminationCount: c.eliminationCount === '' ? null : Number(c.eliminationCount),
              smallFinal: c.smallFinal,
            }),
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

          <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            {catalog.kinds.map((k) => (
              <button
                key={k.id}
                className={`btn btn--small${picked[k.id] ? ' btn--primary' : ''}`}
                onClick={() => toggle({ id: k.id, kind: k.id, label: k.label })}
              >
                {k.label}{existingKinds.has(k.id) ? ' ✓' : ''}
              </button>
            ))}
          </div>

          {/* Les sélections sur une seconde ligne, séparées : ce ne sont pas
              des variantes des disciplines au-dessus mais des compétitions
              entières, sans tableau ni affiche. */}
          <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            {(catalog.wildcards ?? []).map((w) => (
              <button
                key={w.id}
                className={`btn btn--small${picked[w.id] ? ' btn--primary' : ''}`}
                onClick={() => toggle({ ...w, wildcardOnly: true })}
              >
                {w.label}
              </button>
            ))}
          </div>

          {chosen.length > 0 && (
            <div className="panel panel--flush">
              <table>
                <thead>
                  <tr><th>Catégorie</th><th>Tableau</th><th>Éliminations</th><th>3e place</th></tr>
                </thead>
                <tbody>
                  {chosen.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="text" value={c.name} aria-label={`Nom de la catégorie ${c.id}`}
                          onChange={(e) => patch(c.id, { name: e.target.value })}
                          style={{ width: '11rem' }}
                        />
                      </td>

                      {/* Une sélection n'a ni tableau, ni éliminations, ni
                          petite finale : elle a des places. La ligne fusionne
                          donc ses trois dernières colonnes plutôt que d'afficher
                          trois cases grisées. */}
                      {c.wildcardOnly ? (
                        <td colSpan={3}>
                          <span className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              type="number"
                              min={catalog.places?.min ?? 1}
                              max={catalog.places?.max ?? 100}
                              value={c.places}
                              style={{ width: '5.5rem' }}
                              aria-label={`Nombre de places pour ${c.name}`}
                              onChange={(e) => patch(c.id, { places: e.target.value })}
                            />
                            <span className="faint" style={{ fontSize: '0.85rem' }}>
                              places qualificatives — sélection sur vidéo, sans tableau
                            </span>
                          </span>
                        </td>
                      ) : (
                        <>
                          <td>
                            <select
                              value={c.format} aria-label={`Format de ${c.name}`}
                              onChange={(e) => patch(c.id, { format: e.target.value })}
                            >
                              {catalog.brackets.map((b) => (
                                <option key={b.id} value={b.id}>{b.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <label style={{ margin: 0 }}>
                              <input
                                type="checkbox" checked={c.elimination}
                                onChange={(e) => patch(c.id, { elimination: e.target.checked })}
                              />{' '}
                              oui
                            </label>
                            {c.elimination && (
                              <select
                                style={{ marginLeft: '0.5rem' }}
                                value={c.eliminationCount}
                                aria-label={`Qualifiés après éliminations pour ${c.name}`}
                                onChange={(e) => patch(c.id, { eliminationCount: e.target.value })}
                              >
                                <option value="">Taille du tableau</option>
                                {[2, 4, 8, 16, 32].map((n) => (
                                  <option key={n} value={n}>{n} qualifiés</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td>
                            <input
                              type="checkbox" checked={c.smallFinal}
                              disabled={c.format === 'TOP_2'}
                              aria-label={`Petite finale pour ${c.name}`}
                              onChange={(e) => patch(c.id, { smallFinal: e.target.checked })}
                            />
                          </td>
                        </>
                      )}
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
function ArtistRow({ artist, onDone, run, askDelete }) {
  const [editing, setEditing] = useState(false);
  const photo = usePhotoUpload(artist, onDone, run);
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
        {/* Toutes les actions dans un menu : la ligne reste lisible même quand
            elles se multiplient. */}
        <MenuButton
          label={`Actions pour ${artist.name}`}
          items={[
            { label: 'Modifier', onClick: () => setEditing(true) },
            {
              label: artist.imageUrl ? 'Remplacer la photo' : 'Ajouter une photo',
              onClick: () => photo.pick(),
            },
            artist.imageUrl && {
              label: 'Retirer la photo',
              onClick: photo.remove,
            },
            { separator: true },
            {
              label: 'Supprimer',
              danger: true,
              onClick: () =>
                askDelete('artist', artist.id, async (result) => {
                  await onDone();
                  await run(async () =>
                    result?.removedContenders
                      ? `${artist.name} supprimé, ${result.removedContenders} participant(s) retiré(s).`
                      : `${artist.name} supprimé.`
                  );
                }),
            },
          ]}
        />
        {photo.node}
      </td>
    </tr>
  );
}

function ArtistsAdmin() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState({ name: '', country: '', kinds: [] });
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
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

      <div className="panel panel--flush">
        <table>
          <thead>
            <tr><th>Photo</th><th>Nom</th><th>Pays</th><th>Formats</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <ArtistRow key={a.id} artist={a} onDone={reload} run={run} askDelete={askDelete} />
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
/**
 * L'envoi de photo, réduit à un crochet : le déclencheur vit désormais dans le
 * menu de la ligne, mais le champ de fichier et la fenêtre de comparaison
 * doivent rester montés quelque part.
 *
 * Renvoie `pick()` pour ouvrir le sélecteur, `remove()` pour retirer la photo,
 * et `node` à poser dans le rendu.
 */
function usePhotoUpload(artist, onDone, run) {
  const input = useRef(null);
  const [candidate, setCandidate] = useState(null);

  const send = async (file) => {
    if (!file) return;

    // Une photo existe déjà : on la met face à la nouvelle avant de trancher.
    if (artist.imageUrl) return setCandidate(file);

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
    });
  };

  const node = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="visually-hidden"
        onChange={(e) => {
          send(e.target.files?.[0]);
          e.target.value = ''; // pour pouvoir renvoyer le même fichier
        }}
      />
      {candidate && (
        <PhotoCompare
          artist={artist}
          file={candidate}
          onCancel={() => setCandidate(null)}
          onReplaced={async () => {
            setCandidate(null);
            await onDone();
            await run(async () => `Photo de ${artist.name} remplacée.`);
          }}
        />
      )}
    </>
  );

  return {
    node,
    pick: () => input.current?.click(),
    remove: () =>
      run(async () => {
        await api.del(`/admin/photos/upload/${artist.id}`);
        await onDone();
        return `Photo de ${artist.name} retirée.`;
      }),
  };
}


// =============================================================================
//  RÉSULTATS
//  Une phase à la fois. La navigation se fait par onglets, l'avancement se lit
//  d'un coup d'œil, et la publication part en un seul envoi par phase —
//  l'ancien enregistrement affiche par affiche relançait le calcul de toute la
//  catégorie à chaque clic.
// =============================================================================

/**
 * Le score maximal atteignable, phase par phase.
 *
 * Un contrôle avant ouverture : si le total ne correspond pas à ce qu'on
 * attend, c'est que la structure est mal montée — une phase oubliée, un nombre
 * de qualifiés incohérent. Le maximum ne dépend que de la structure, pas des
 * résultats : il est donc vérifiable dès la création de l'événement.
 */
function MaxScorePanel({ eventId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setData(null);
    if (!eventId) return;
    api.get(`/admin/events/${eventId}/max-score`).then(setData).catch(() => { });
  }, [eventId]);

  if (!data) return null;

  return (
    <div className="panel stack" style={{ gap: '0.6rem' }}>
      <div className="spread">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Contrôle du barème</p>
          <h3>Score maximal : {data.total} points</h3>
        </div>
        <button className="btn btn--small" onClick={() => setOpen(!open)}>
          {open ? 'Réduire' : 'Détail par phase'}
        </button>
      </div>

      <div className="row" style={{ gap: '1.2rem' }}>
        {data.categories.map((c) => (
          <span className="readout" key={c.categoryId}>
            <span className="readout__value">{c.total}</span>
            <span className="readout__unit">{c.category}</span>
          </span>
        ))}
      </div>

      {open && (
        <div className="panel panel--flush">
          <table>
            <thead>
              <tr><th>Catégorie</th><th>Phase</th><th>Calcul</th><th className="num">Points</th></tr>
            </thead>
            <tbody>
              {data.categories.flatMap((c) =>
                c.lines.map((l) => (
                  <tr key={l.phaseId}>
                    <td className="muted">{c.category}</td>
                    <td>{l.phase}</td>
                    <td className="faint data" style={{ fontSize: '0.8rem' }}>{l.detail}</td>
                    <td className="num">{l.points}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ROUND_LABELS = {
  // Sans cette entrée, un tour de 32 s'affichait sans intitulé.
  ROUND_OF_32: 'Seizièmes',
  ROUND_OF_16: 'Huitièmes',
  QUARTER: 'Quarts',
  SEMI: 'Demi-finales',
  SMALL_FINAL: 'Petite finale',
  FINAL: 'Finale',
  LEGACY: 'Legacy',
};
const ROUND_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

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
            onClick={() =>
              run(async () => {
                const { rescored } = await api.post(`/admin/categories/${category.id}/rescore`);
                // Le rechargement n'est pas cosmétique : les points affichés sur
                // la page viennent de la réponse précédente, et sans lui on
                // annonce un recalcul en montrant les anciens chiffres.
                await reload();
                return `${category.name} : ${rescored} pronostic(s) recalculé(s).`;
              })
            }
          >
            Recalculer {category.name}
          </button>
        )}
      </div>

      {slug && <MaxScorePanel eventId={detail?.event.id} />}

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
            category={category}
            contenders={category.contenders}
            onDone={reload}
            run={run}
          />
        ) : (
          <RankingResults
            key={phase.id}
            phase={phase}
            category={category}
            contenders={category.contenders}
            onDone={reload}
            run={run}
          />
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
/**
 * Saisie d'un tableau, sur le même arbre que les joueurs.
 *
 * L'ancienne liste de sélecteurs ne montrait pas la structure : on ne voyait
 * pas d'où venait chaque affiche. Ici c'est le BracketBoard de la page de
 * pronostic, en mode officiel — les participants du premier tour se déduisent
 * du classement d'éliminations publié, et chaque vainqueur désigné propage le
 * suivant.
 */
function BracketResults({ phase, event, category, contenders, onDone, run }) {
  // Le classement de la dernière phase de qualification alimente l'arbre.
  //
  // Publié ou non : côté organisateur, un classement enregistré en brouillon
  // est déjà une décision, et l'arbre doit le refléter pour qu'on puisse
  // préparer la suite avant de publier. Le tri par `position` est nécessaire —
  // `pop()` sur un tableau non trié prenait une phase au hasard.
  /**
   * La phase de qualification qui alimente ce tableau, s'il en existe une.
   *
   * Son EXISTENCE et son CONTENU repondent a deux questions differentes.
   * Qu'elle existe decide si le premier tour se deduit ou se compose a la main ;
   * ce qu'elle contient decide de QUI y figure. Les confondre rendait un
   * classement vide indiscernable d'une categorie sans eliminations : l'ecran
   * retombait en mode manuel et gardait les participants d'un classement
   * efface.
   */
  const qualifying = useMemo(
    () =>
      [...(category?.phases ?? [])]
        .filter((p) => ['SEEDING', 'WILDCARD', 'ELIMINATION'].includes(p.type))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .pop() ?? null,
    [category]
  );

  const seedFromRanking = useMemo(() => {
    // Sans phase de qualification -- une Loopstation en tableau direct -- ce
    // sont les seeds d'inscription qui composent le premier tour. Sans ce
    // repli, rien ne l'alimentait et le tableau restait vide malgre des
    // participants bien presents.
    if (!qualifying) return seedFromContenders(category?.contenders ?? []);
    if (!qualifying.entries?.length) return [];
    return [...qualifying.entries]
      .sort((a, b) => a.rank - b.rank)
      .filter((e) => (qualifying.qualifierCount ? e.qualified : true))
      .map((e) => e.contenderId);
  }, [qualifying, category]);

  // L'état local reprend la forme attendue par BracketBoard.
  const [picks, setPicks] = useState(() =>
    Object.fromEntries(
      (phase.battles ?? []).map((b) => [
        `${b.round}:${b.slot}`,
        {
          phaseId: phase.id,
          round: b.round,
          slot: b.slot,
          contenderAId: b.contenderAId,
          contenderBId: b.contenderBId,
          winnerId: b.winnerId,
          scoreA: b.scoreA,
          scoreB: b.scoreB,
        },
      ])
    )
  );
  const [dirty, setDirty] = useState(false);

  /**
   * Resynchronise l'editeur quand le serveur a recompose le tableau.
   *
   * `picks` est initialise une seule fois. Apres un enregistrement du
   * classement, le serveur rededuit le premier tour et le rechargement rapporte
   * de nouvelles affiches -- mais l'etat local gardait les anciennes et les
   * repoussait au prochain envoi, annulant le recalcul en silence.
   *
   * La signature compare le CONTENU, pas la reference : le rechargement cree de
   * nouveaux objets a chaque fois. Une saisie en cours n'est jamais ecrasee.
   */
  const signature = useMemo(
    () =>
      (phase.battles ?? [])
        .map((b) =>
          [b.round, b.slot, b.contenderAId, b.contenderBId, b.winnerId, b.scoreA, b.scoreB].join('~')
        )
        .join('|'),
    [phase.battles]
  );
  const applied = useRef(signature);

  useEffect(() => {
    if (dirty || signature === applied.current) return;
    applied.current = signature;
    setPicks(
      Object.fromEntries(
        (phase.battles ?? []).map((b) => [
          `${b.round}:${b.slot}`,
          {
            phaseId: phase.id,
            round: b.round,
            slot: b.slot,
            contenderAId: b.contenderAId,
            contenderBId: b.contenderBId,
            winnerId: b.winnerId,
            scoreA: b.scoreA,
            scoreB: b.scoreB,
          },
        ])
      )
    );
  }, [signature, dirty, phase.battles, phase.id]);

  const change = (next) => {
    setPicks(next);
    setDirty(true);
  };

  const filled = Object.values(picks).filter((p) => p.winnerId).length;

  const send = (resolved) =>
    run(async () => {
      const byKey = new Map(
        (phase.battles ?? []).map((b) => [`${b.round}:${b.slot}`, b.id])
      );
      await api.put(`/admin/phases/${phase.id}/battles`, {
        resolved,
        battles: Object.entries(picks)
          .filter(([k]) => byKey.has(k))
          .map(([k, p]) => ({
            id: byKey.get(k),
            contenderAId: p.contenderAId ?? null,
            contenderBId: p.contenderBId ?? null,
            winnerId: p.winnerId ?? null,
            scoreA: p.scoreA ?? null,
            scoreB: p.scoreB ?? null,
            played: Boolean(p.winnerId),
          })),
      });
      setDirty(false);
      await onDone();
      return resolved
        ? `${phase.name} publiée : les pronostics ont été recalculés.`
        : `${phase.name} enregistrée en brouillon — rien n'est encore visible des joueurs.`;
    });

  return (
    <div className="stack">
      <div className="panel spread">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{phase.type}</p>
          <h2>{phase.name}</h2>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          <Progress done={filled} total={phase.battles?.length ?? 0} />
          <button className="btn btn--small" onClick={() => send(false)}>
            Enregistrer{dirty ? ' •' : ''}
          </button>
          <button className="btn btn--small btn--primary" onClick={() => send(true)}>
            {phase.resolved ? 'Republier' : 'Publier'}
          </button>
          {phase.resolved && (
            <button className="btn btn--small btn--ghost" onClick={() => send(false)}>
              Dépublier
            </button>
          )}
        </div>
      </div>

      <PublishState phase={phase} />

      {seedFromRanking.length === 0 && (
        <p className="faint" style={{ fontSize: '0.86rem', margin: 0 }}>
          {qualifying
            ? `« ${qualifying.name} » ne contient aucun qualifié : le premier tour reste vide et se remplira dès que le classement sera saisi et enregistré.`
            : 'Aucune phase de qualification, et aucun seed sur les participants : composez les affiches à la main, ou renseignez les seeds dans l’onglet Événements.'}
        </p>
      )}

      <BracketBoard
        phase={phase}
        phaseBattles={phase.battles ?? []}
        contenders={contenders}
        picks={picks}
        onChange={change}
        locked={false}
        seedFromRanking={seedFromRanking}
        event={event}
        authoritative
        // Le premier tour se déduit dès qu'une PHASE de qualification existe,
        // pleine ou vide. Se fier au nombre de qualifiés ramenait l'autorité aux
        // affiches enregistrées sitôt le classement effacé, et le tableau ne se
        // vidait jamais. Sans phase de qualification, les affiches déjà
        // composées tiennent — mais une affiche vide se remplit depuis les
        // seeds, via `seedFromRanking`.
        officialDraw={!qualifying}
      />
    </div>
  );
}


/** Saisie d'un classement, avec numérotation assistée. */
const QUALIFIER_CHOICES = [null, 2, 4, 8, 16, 32];

/**
 * Saisie d'un classement officiel, au glisser-déposer.
 *
 * Reprend le RankingBoard de la page de pronostic : classer des artistes est le
 * même geste qu'on soit joueur ou organisateur, et deux interfaces différentes
 * pour la même tâche n'auraient servi personne.
 *
 * Enregistrer ne publie pas. Tant que la phase n'est pas publiée, les résultats
 * restent invisibles des joueurs et aucun score n'est recalculé — de quoi
 * saisir le Solo pendant que le Tag Team attend encore ses résultats.
 */
function RankingResults({ phase, category, contenders, onDone, run }) {
  /**
   * Une sélection ne compte pas ses places en tailles de tableau.
   *
   * Le sélecteur ci-dessous n'offre que 2, 4, 8, 16 et 32 — la liste des
   * tailles d'arbre. C'était sans conséquence tant qu'une sélection ne pouvait
   * pas sortir de ces valeurs ; ce n'est plus le cas depuis que le panneau de
   * format en accepte 1 à 100. Une sélection à sept places n'y trouverait
   * aucune option correspondante : le champ retomberait sur « Aucune coupe » et
   * affirmerait à l'écran que la phase n'en a pas, alors qu'elle en a une.
   */
  const isWildcard = isWildcardCategory(category);
  const [order, setOrder] = useState(() =>
    [...(phase.entries ?? [])].sort((a, b) => a.rank - b.rank).map((e) => e.contenderId)
  );
  const [cut, setCut] = useState(phase.qualifierCount ?? null);
  const [dirty, setDirty] = useState(false);

  const change = (next) => {
    setOrder(next);
    setDirty(true);
  };

  const fillBySeed = () =>
    change(
      [...contenders].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999)).map((c) => c.id)
    );

  const send = (resolved) =>
    run(async () => {
      const { reseed } = await api.put(`/admin/phases/${phase.id}/results`, {
        resolved,
        entries: order.map((contenderId, i) => ({
          contenderId,
          rank: i + 1,
          qualified: cut ? i < cut : false,
        })),
      });
      setDirty(false);
      await onDone();

      // Ce que le tableau est devenu fait partie du retour : recomposer le
      // premier tour peut effacer des vainqueurs déjà saisis, et l'apprendre en
      // changeant d'onglet serait une mauvaise surprise.
      const parts = [];
      if (reseed?.battles) parts.push(`${reseed.battles} affiche(s) mise(s) à jour`);
      if (reseed?.cleared) parts.push(`${reseed.cleared} vidée(s)`);
      const moved = parts.length ? ` Tableau recomposé : ${parts.join(', ')}.` : '';

      return (resolved
        ? `${phase.name} publiée : les pronostics ont été recalculés.`
        : `${phase.name} enregistrée en brouillon — rien n'est encore visible des joueurs.`) + moved;
    });

  return (
    <div className="stack">
      <div className="panel spread">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{phase.type}</p>
          <h2>{phase.name}</h2>
        </div>

        <div className="row" style={{ gap: '0.6rem' }}>
          <div className="field">
            <label htmlFor={`cut-${phase.id}`}>Qualifiés</label>
            {isWildcard ? (
              /* Saisie libre, enregistrée à la SORTIE du champ et non à chaque
                 frappe : déplacer la coupe rescore tous les pronostics déposés,
                 et taper « 12 » aurait lancé ce calcul une première fois sur
                 « 1 ». */
              <input
                id={`cut-${phase.id}`}
                type="number"
                min={MIN_PLACES}
                max={MAX_PLACES}
                style={{ width: '6rem' }}
                value={cut ?? ''}
                onChange={(e) => setCut(e.target.value === '' ? null : Number(e.target.value))}
                onBlur={() => {
                  const n = cut === null ? null : Math.min(MAX_PLACES, Math.max(MIN_PLACES, cut));
                  if (n === (phase.qualifierCount ?? null)) return;
                  setCut(n);
                  run(async () => {
                    await api.patch(`/admin/phases/${phase.id}/qualifiers`, { qualifierCount: n });
                    await onDone();
                    return n ? `${n} place(s) sur cette sélection.` : 'Sélection sans coupe.';
                  });
                }}
              />
            ) : (
              <select
                id={`cut-${phase.id}`}
                value={cut ?? ''}
                onChange={(e) => {
                  const n = e.target.value === '' ? null : Number(e.target.value);
                  setCut(n);
                  run(async () => {
                    await api.patch(`/admin/phases/${phase.id}/qualifiers`, { qualifierCount: n });
                    await onDone();
                    return n ? `${n} qualifiés sur cette phase.` : 'Phase sans qualification.';
                  });
                }}
              >
                {/* La valeur en place est injectée si elle n'est pas dans la
                    liste : un palier réglé à 6 par une autre voie ne doit pas
                    s'afficher comme « Aucune coupe ». */}
                {(QUALIFIER_CHOICES.includes(cut) ? QUALIFIER_CHOICES : [...QUALIFIER_CHOICES, cut])
                  .map((n) => (
                    <option key={n ?? 'none'} value={n ?? ''}>
                      {n ? `${n} qualifiés` : 'Aucune coupe'}
                    </option>
                  ))}
              </select>
            )}
          </div>

          <Progress done={order.length} total={contenders.length} />

          <button className="btn btn--small" onClick={fillBySeed}>Classer par seed</button>
          <button className="btn btn--small" onClick={() => send(false)}>
            Enregistrer{dirty ? ' •' : ''}
          </button>
          <button className="btn btn--small btn--primary" onClick={() => send(true)}>
            {phase.resolved ? 'Republier' : 'Publier'}
          </button>
          {phase.resolved && (
            <button className="btn btn--small btn--ghost" onClick={() => send(false)}>
              Dépublier
            </button>
          )}
        </div>
      </div>

      <PublishState phase={phase} />

      <RankingBoard
        phase={{ ...phase, qualifierCount: cut }}
        contenders={contenders}
        order={order}
        onChange={change}
        locked={false}
      />
    </div>
  );
}

/** Dit clairement si ce qui est saisi est visible des joueurs. */
function PublishState({ phase }) {
  return phase.resolved ? (
    <p className="notice notice--ok" style={{ margin: 0 }}>
      Phase publiée : les résultats sont visibles et les pronostics scorés.
    </p>
  ) : (
    <p className="notice" style={{ margin: 0, borderColor: 'var(--line)', color: 'var(--ink-faint)' }}>
      Brouillon de résultats : rien n'est visible des joueurs, aucun score n'est calculé.
      Publiez quand la phase est complète.
    </p>
  );
}