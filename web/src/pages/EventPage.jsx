import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import RankingBoard from '../components/RankingBoard.jsx';
import Toast from '../components/Toast.jsx';
import ScoringHelp from '../components/ScoringHelp.jsx';
import WildcardHelp from '../components/WildcardHelp.jsx';
import WildcardBoard from '../components/WildcardBoard.jsx';
import { isWildcardCategory } from '../lib/wildcard.js';
import PromptDialog from '../components/PromptDialog.jsx';
import Modal from '../components/Modal.jsx';
import { seedFromContenders } from '../lib/bracket.js';
import useUnsavedGuard from '../lib/useUnsavedGuard.js';
import BracketBoard from '../components/BracketBoard.jsx';
import PhaseResult from '../components/PhaseResult.jsx';
import ResultStats from '../components/ResultStats.jsx';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];

/**
 * Une empreinte stable du contenu d'une version. Les clés sont triées pour que
 * deux états identiques donnent la même chaîne quel que soit l'ordre dans
 * lequel ils ont été construits — sans quoi on signalerait des modifications
 * imaginaires.
 */
function fingerprint(state) {
  // Attention : cette empreinte doit voir EXACTEMENT ce que le serveur
  // conserve. BracketBoard remonte au parent toutes les affiches dont un côté
  // est connu — y compris sans vainqueur — alors que seules celles ayant deux
  // côtés ET un choix sont enregistrées. Compter les autres rendait la
  // catégorie éternellement « modifiée ».
  const orders = Object.entries(state?.orders ?? {})
    .filter(([, ids]) => ids?.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phaseId, ids]) => [phaseId, ids]);

  const picks = Object.entries(state?.picks ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phaseId, byBattle]) => [
      phaseId,
      Object.entries(byBattle)
        // Seules les affiches complètes voyagent jusqu'au serveur : les autres
        // ne doivent pas peser dans la comparaison.
        .filter(([, v]) => v.contenderAId && v.contenderBId)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v.winnerId ?? null, v.scoreA ?? null, v.scoreB ?? null])
        // Une affiche sans vainqueur ni score n'est pas une modification.
        .filter(([, w, sa]) => w != null || sa != null),
    ])
    .filter(([, list]) => list.length);

  // La poche compte, elle. Piocher quinze noms sans en placer un seul est un
  // vrai travail : si l'empreinte l'ignorait, le bouton « Enregistrer » resterait
  // éteint et la page laisserait partir sans prévenir — exactement la perte
  // qu'on cherche à empêcher.
  //
  // Les listes sont prises telles quelles, ordre compris : l'ordre de pioche
  // est celui de la colonne « à placer », donc le changer EST une modification.
  const pool = Object.fromEntries(
    Object.entries(state?.pool ?? {}).filter(([, list]) => (list ?? []).length)
  );

  // Le tampon, lui, a quitté cette page : il se pose dans la fenêtre d'export,
  // par sa propre route.
  return JSON.stringify({ orders, picks, pool });
}
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
  // Le nom proposé pour la copie en cours de création, ou null si la fenêtre
  // est fermée.
  const [naming, setNaming] = useState(null);
  // L'empreinte de chaque version telle qu'elle est enregistrée côté serveur.
  const [baseline, setBaseline] = useState({});
  // La fenêtre de statistiques est-elle ouverte ? Elle charge ses propres
  // données à l'ouverture : une agrégation sur tous les pronostics déposés n'a
  // pas à être payée par les visites qui ne l'affichent jamais.
  const [statsOpen, setStatsOpen] = useState(false);
  const navigate = useNavigate();

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
        setBaseline(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, fingerprint(v)])));
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const category = useMemo(
    () => data?.event.categories.find((c) => c.id === activeId) ?? null,
    [data, activeId]
  );

  /**
   * Les versions dont le contenu diffère de ce qui est enregistré. On regarde
   * toutes les catégories, pas seulement celle affichée : on peut avoir touché
   * au Solo puis basculé sur le Crew avant de partir.
   */
  const unsaved = useMemo(() => {
    const out = [];
    for (const [k, content] of Object.entries(draft)) {
      const empty = fingerprint({ orders: {}, picks: {}, pool: {} });
      if (fingerprint(content) === (baseline[k] ?? empty)) continue;

      // Retrouver la catégorie : soit la clé provisoire, soit l'id de version.
      const provisional = k.startsWith('new:') ? k.slice(4) : null;
      const categoryId =
        provisional ??
        Object.entries(versions).find(([, list]) => list.some((v) => v.id === k))?.[0];
      if (!categoryId) continue;

      // Une clé provisoire survivant à la création d'une version est un
      // résidu : la catégorie a bien un pronostic, on ne la signale pas.
      const existing = (versions[categoryId] ?? [])[0]?.id ?? null;
      if (provisional && existing) continue;

      out.push({
        key: k,
        predictionId: provisional ? existing : k,
        categoryId,
        category: data?.event.categories.find((c) => c.id === categoryId)?.name ?? '',
      });
    }
    return out;
  }, [draft, baseline, versions, data]);

  const guard = useUnsavedGuard(unsaved.length > 0);

  // Aucun hook au-delà de cette ligne : les deux sorties ci-dessous rendraient
  // le nombre d'appels variable d'un rendu à l'autre, et React refuse
  // (« Rendered more hooks than during the previous render »).
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
  const state = draft[stateKey] ?? { orders: {}, picks: {}, pool: {} };
  const eventClosed = event.status === 'FINISHED';
  // En cours : la compétition a démarré, les pronostics sont figés. On peut
  // encore tout consulter — versions comprises — mais plus rien modifier.
  const eventLive = event.status === 'LIVE';
  const readOnly = eventClosed || eventLive;

  const update = (patch) =>
    setDraft((d) => ({ ...d, [stateKey]: { ...(d[stateKey] ?? { orders: {}, picks: {}, pool: {} }), ...patch } }));

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
      // La clé provisoire a rempli son office : son contenu vit désormais sous
      // l'identifiant de la version. La laisser en place la faisait compter
      // comme une catégorie « jamais enregistrée », indéfiniment.
      if (predictions.length > 0) delete next[`new:${categoryId}`];
      return next;
    });
    // Ce qui vient du serveur devient la nouvelle référence : sans cela, une
    // version fraîchement enregistrée resterait signalée comme modifiée.
    setBaseline((b) => {
      const next = { ...b };
      for (const p of predictions) next[p.id] = fingerprint(readVersion(p));
      delete next[`new:${categoryId}`];
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
      // La poche des sélections sur vidéo. Envoyée telle quelle, y compris
      // vide : c'est ce qui permet de retirer le dernier nom de son plateau.
      pool: state.pool ?? {},

      // La clé `stamp` est délibérément ABSENTE. Le schéma la rend facultative,
      // et omise, le serveur conserve celle qui est en base. L'envoyer d'ici
      // effacerait le tampon posé entre-temps depuis la fenêtre d'export : cette
      // page ne le connaît plus, elle n'a donc rien à en dire.
    };
  }

  /**
   * Garantit qu'une version existe pour la catégorie courante, et renvoie son
   * identifiant. La création est paresseuse : on ne crée une ligne que le jour
   * où la personne enregistre vraiment quelque chose.
   */
  async function ensureVersion() {
    if (currentId) return currentId;
    // Une version peut exister sans être encore sélectionnée : on la reprend
    // plutôt que d'en créer une deuxième.
    const existing = myVersions[0]?.id;
    if (existing) {
      setCurrent((c) => ({ ...c, [activeId]: existing }));
      return existing;
    }
    const { prediction } = await api.post(`/predictions/categories/${activeId}`, {
      label: 'Mon pronostic',
    });
    // Le contenu saisi sous la clé provisoire suit la nouvelle version.
    setDraft((d) => ({ ...d, [prediction.id]: d[`new:${activeId}`] ?? { orders: {}, picks: {}, pool: {} } }));
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

  /**
   * Crée une version, soit en copiant l'état actuel, soit vierge.
   *
   * Les deux gestes n'ont pas la même suite. Une copie est une sauvegarde : on
   * reste où l'on était, la version ouverte ne change pas. Un brouillon vierge
   * est un point de départ : y basculer est tout l'intérêt, sans quoi on
   * l'aurait créé pour rien.
   */
  async function createVersion(label, blank) {
    setSaving(true);
    setFlash(null);
    try {
      if (blank) {
        const { prediction } = await api.post(`/predictions/categories/${activeId}`, { label });
        // La feuille blanche est posée AVANT le rechargement : `readVersion`
        // renverrait un contenu vide de toute façon, mais l'écran garderait
        // l'ancien affiché le temps de l'aller-retour.
        setDraft((d) => ({ ...d, [prediction.id]: { orders: {}, picks: {}, pool: {} } }));
        await refreshVersions(activeId, prediction.id);
        setNaming(null);
        setFlash({ ok: true, at: Date.now(), text: t('draft.blank.done', { name: prediction.label }) });
        return;
      }

      const id = await ensureVersion();
      await api.put(`/predictions/${id}`, payload());
      const { prediction } = await api.post(`/predictions/categories/${activeId}`, {
        copyFrom: id,
        label,
      });
      // On reste sur la version en cours : la copie est une sauvegarde, pas
      // un changement de contexte.
      await refreshVersions(activeId, id);
      setNaming(null);
      setFlash({ ok: true, at: Date.now(), text: t('draft.saved', { name: prediction.label }) });
    } catch (e) {
      setFlash({ ok: false, at: Date.now(), text: e.message });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Enregistre tout ce qui traîne, dans toutes les catégories. Une version
   * jamais créée l'est au passage — c'est le cas d'une catégorie remplie mais
   * jamais enregistrée.
   */
  async function saveEverything() {
    for (const item of unsaved) {
      const content = draft[item.key];
      const body = {
        ranks: Object.entries(content.orders ?? {}).flatMap(([phaseId, ids]) =>
          ids.map((contenderId, i) => ({ phaseId, contenderId, rank: i + 1 }))
        ),
        battles: Object.values(content.picks ?? {}).flatMap((byBattle) =>
          Object.values(byBattle).filter((b) => b.contenderAId && b.contenderBId)
        ),
      };

      // On n'ouvre une version que s'il n'en existe VRAIMENT aucune. Sans ce
      // repli sur la version courante, chaque avertissement créait un brouillon
      // de plus — dix en quelques allers-retours.
      let id =
        item.predictionId ??
        current[item.categoryId] ??
        (versions[item.categoryId] ?? [])[0]?.id ??
        null;

      if (!id) {
        const { prediction } = await api.post(`/predictions/categories/${item.categoryId}`, {
          label: 'Mon pronostic',
        });
        id = prediction.id;
      }
      await api.put(`/predictions/${id}`, body);
      await refreshVersions(item.categoryId, id);
    }
  }

  /** Poursuit ce que la garde avait interrompu. */
  function leave() {
    const p = guard.pending;
    guard.cancel();
    if (!p) return;
    if (p.type === 'link') navigate(p.href);
    else if (p.type === 'back') window.history.go(-2);
    else if (p.type === 'action') p.run();
  }

  /** Un nom par défaut qui distingue la copie de son original. */
  function suggestedName() {
    const base = activeVersion?.label ?? t('draft.untitled');
    const n = myVersions.length + 1;
    return t('draft.copy.of', { name: base, n });
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
          {/* Un événement en cours vaut date butoir dépassée : sans cela, un
              LIVE sans date affichait « pas encore de date de fermeture ». */}
          <span className={`tag${(deadlinePassed || eventLive) ? ' tag--done' : deadline ? ' tag--live' : ''}`}>
            {(deadlinePassed || eventLive)
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
              // Changer d'onglet ne fait rien perdre : le contenu des autres
              // catégories reste en mémoire, et la garde se déclenchera au
              // moment de quitter réellement la page.
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

      {/* Jaune comme le tag « en cours » : c'est une information, pas une
          erreur. */}
      {eventLive && (
        <p className="notice" style={{ borderColor: 'var(--y)', color: 'var(--y)' }}>
          {t('event.closed.live')}
        </p>
      )}

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
            {/* Le sélecteur reste actif en LIVE — relire ses brouillons pendant
                la compète fait partie du jeu — mais la copie créerait une
                version, donc elle se ferme avec le reste. */}
            <button
              className="btn btn--small"
              onClick={() => setNaming({ label: suggestedName(), blank: false })}
              disabled={saving || myVersions.length >= 10 || eventLive}
            >
              {t('draft.snapshot')}
            </button>
            {/* Repartir de zéro sans tout effacer à la main. Distinct de la
                copie : celle-ci sauvegarde ce qu'on a, celui-là recommence. */}
            <button
              className="btn btn--small"
              onClick={() => setNaming({ label: t('draft.blank.name'), blank: true })}
              disabled={saving || myVersions.length >= 10 || eventLive}
            >
              {t('draft.blank')}
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
          locked={readOnly || !user}
        />
      )}

      {user && !readOnly && (
        <div className="actionbar">
          {/* Sur la version déjà déposée, enregistrer et redéposer font la même
              chose : un seul bouton. Sur un brouillon, les deux gestes sont
              distincts — garder pour soi, ou faire compter. */}
          {activeVersion?.submitted ? (
            <button className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? t('event.saving') : t('event.save.filed')}
            </button>
          ) : (
            <>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? t('event.saving') : t('event.save.draft')}
              </button>
              <button className="btn btn--primary" onClick={submitCurrent} disabled={saving}>
                {saving ? t('event.saving') : t('event.save.submit')}
              </button>
            </>
          )}


          <button className="btn btn--small btn--ghost" onClick={() => setHelpOpen(true)}>
            ? {t('help.open')}
          </button>
          <span className="faint" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
            {t('event.editable')}
          </span>
        </div>
      )}

      {/* Les lectures de la foule, derrière un bouton et non dépliées.

          Elles vivaient en bas de la page de classement, où elles répondaient à
          une question que cette page ne posait pas : le classement dit qui
          marque le plus, celles-ci disent quels ARTISTES la foule a mal placés.
          Rattachées à l'événement, elles retrouvent un cadre — mais dépliées
          sous l'éditeur, trois tableaux plus la liste complète des participants
          enterraient le pronostic du joueur, qui est la raison pour laquelle on
          est venu. Un bouton laisse chacun décider de l'ordre. */}
      {eventClosed && (
        <div className="row" style={{ marginTop: '2rem' }}>
          <button className="btn" onClick={() => setStatsOpen(true)}>
            {t('stats.results.open')}
          </button>
        </div>
      )}

      {statsOpen && <ResultStats slug={slug} onClose={() => setStatsOpen(false)} />}

      <Toast
        message={flash?.text}
        ok={flash?.ok}
        onDismiss={() => setFlash(null)}
      />
      {/* Deux barèmes, deux fenêtres. Quelqu'un qui remplit une sélection n'a
          aucune raison de lire comment se comptent les affiches d'un tableau :
          il n'y en a pas. La règle se lit dans la structure de la catégorie
          ouverte, pas dans un réglage. */}
      {helpOpen && (
        isWildcardCategory(category) ? (
          <WildcardHelp
            places={category?.phases?.[0]?.qualifierCount ?? null}
            onClose={() => setHelpOpen(false)}
          />
        ) : (
          <ScoringHelp onClose={() => setHelpOpen(false)} />
        )
      )}

      {guard.pending && (
        <Modal
          title={t('leave.title')}
          subtitle={event.name}
          onClose={guard.cancel}
          footer={
            <>
              <button
                className="btn btn--primary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveEverything();
                    leave();
                  } catch (e) {
                    guard.cancel();
                    setFlash({ ok: false, at: Date.now(), text: e.message });
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? t('event.saving') : t('leave.save')}
              </button>
              <button className="btn btn--danger" disabled={saving} onClick={leave}>
                {t('leave.discard')}
              </button>
              <button className="btn" disabled={saving} onClick={guard.cancel}>
                {t('leave.stay')}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>{t('leave.body')}</p>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {unsaved.map((u) => (
              <li key={u.key}>
                {u.category}
                {!u.predictionId && ` — ${t('leave.never')}`}
              </li>
            ))}
          </ul>
          <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>{t('leave.hint')}</p>
        </Modal>
      )}

      {naming !== null && (
        <PromptDialog
          title={t(naming.blank ? 'draft.blank.title' : 'draft.copy.title')}
          subtitle={category?.name}
          label={t('draft.copy.label')}
          hint={t(naming.blank ? 'draft.blank.hint' : 'draft.copy.hint')}
          initialValue={naming.label}
          confirmLabel={t(naming.blank ? 'draft.blank.confirm' : 'draft.copy.confirm')}
          cancelLabel={t('draft.cancel')}
          busy={saving}
          onConfirm={(label) => createVersion(label, naming.blank)}
          onCancel={() => setNaming(null)}
        />
      )}
    </div>
  );
}

function CategoryEditor({ category, event, state, update, phaseLocked, locked }) {
  const { t } = useI18n();
  // La phase dont on regarde le résultat, ou null. L'état vit ICI et non dans
  // EventPage : la comparaison a besoin des participants, du classement et des
  // affiches de la catégorie ouverte, c'est-à-dire de tout ce que ce composant
  // tient déjà. Le remonter d'un cran obligerait à faire redescendre quatre
  // propriétés pour rien.
  const [resultFor, setResultFor] = useState(null);
  // Plus aucune lecture de session ici : elle ne servait qu'au tampon porté,
  // et le tampon a quitté cette page. Un abonnement au contexte qui ne sert à
  // rien reste un abonnement — ce composant se rerendait à chaque changement
  // de session pour une valeur qu'il n'utilise plus.
  const contenders = category.contenders;

  // Le jury de la catégorie. Vide tant que l'organisateur ne l'a pas saisi :
  // annoncer un panel qu'on ne connaît pas serait pire que se taire.
  const judges = category.judges ?? [];

  // Le classement de la dernière phase de qualification sert à composer l'arbre.
  const qualifyingPhase = [...category.phases]
    .filter((p) => RANKING_TYPES.includes(p.type))
    .pop();

  // Tant que la qualification n'est pas jouée, c'est le classement pronostiqué
  // qui compose le tableau. Une fois la phase PUBLIÉE, c'est le classement
  // officiel : l'arbre suit la réalité, pas un pronostic devenu sans objet — et
  // il reste composable même si l'on a effacé son propre classement.
  const officialSeed = (qualifyingPhase?.resolved ? qualifyingPhase.entries ?? [] : [])
    .filter((e) => e.rank != null && (qualifyingPhase.qualifierCount ? e.qualified : true))
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((e) => e.contenderId);

  const mySeed = qualifyingPhase ? state.orders[qualifyingPhase.id] ?? [] : [];

  /**
   * Le tableau direct : une catégorie SANS phase de qualification.
   *
   * Une Loopstation se joue souvent ainsi — pas d'éliminations, les
   * participants entrent sur leur seed d'inscription. Rien n'alimentait alors
   * le premier tour : `seedFromRanking` restait vide, aucune règle de
   * `resolveBracket` ne s'appliquait, et le tableau s'affichait vide alors que
   * les participants étaient bien là.
   *
   * Le repli ne vaut QUE sans phase de qualification. Là où il en existe une,
   * un tableau composé sur les seeds d'inscription serait un tableau que
   * personne n'a pronostiqué : mieux vaut le laisser vide jusqu'au classement.
   */
  const directSeed = qualifyingPhase ? [] : seedFromContenders(contenders);

  const seedFromRanking = officialSeed.length
    ? officialSeed
    : mySeed.length
      ? mySeed
      : directSeed;

  // Un tirage de premier tour ne peut exister qu'une fois la qualification
  // jouée et publiée. Avant cela, les appariements présents en base sont ceux
  // que l'éditeur d'organisateur compose tout seul : ils ne doivent pas
  // s'imposer au joueur. Une catégorie sans phase de qualification n'a rien à
  // attendre — son tableau est composé directement par l'organisateur.
  const officialDraw = !qualifyingPhase || Boolean(qualifyingPhase.resolved);

  /**
   * Un classement vidé remet les arbres à zéro.
   *
   * Effacer sa qualification et voir le tableau garder ses vainqueurs est
   * déroutant, et ça l'est d'autant plus quand l'organisateur a publié le
   * tirage du premier tour : les affiches ne dépendent alors plus du
   * classement, donc rien ne bouge tout seul. Le geste « tout effacer » du
   * classement doit valoir pour la catégorie entière.
   *
   * Uniquement sur un vidage complet : réordonner ne doit rien effacer, la
   * résolution invalide déjà d'elle-même les choix devenus impossibles.
   */
  const clearedPicks = () =>
    Object.fromEntries(
      Object.entries(state.picks).map(([phaseId, byBattle]) => [
        phaseId,
        Object.fromEntries(
          Object.entries(byBattle).map(([k, p]) => [
            k,
            { ...p, winnerId: null, scoreA: null, scoreB: null },
          ])
        ),
      ])
    );

  function changeOrder(phase, order) {
    const patch = { orders: { ...state.orders, [phase.id]: order } };
    const emptied = order.length === 0 && (state.orders[phase.id] ?? []).length > 0;
    if (emptied && phase.id === qualifyingPhase?.id) patch.picks = clearedPicks();
    update(patch);
  }

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      {/* Le jury, une fois pour la catégorie et non sur chaque phase : c'est le
          même panel du début à la fin, et le répéter à quatre reprises le
          transformerait en bruit. */}
      {judges.length > 0 && (
        <p className="silkscreen" style={{ margin: 0 }}>
          {t('event.jury')} <span className="data">{judges.join(' · ')}</span>
        </p>
      )}

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
                {/* Le résultat s'ouvre, il ne s'impose pas. Déplié sous le
                    tableau, il doublait la hauteur de chaque phase et repoussait
                    la phase suivante hors de l'écran — sur téléphone, faire
                    défiler deux tableaux pour atteindre la catégorie d'après
                    est un prix qu'on ne paie pas volontiers pour une information
                    qu'on a déjà lue une fois. */}
                {phase.resolved && (
                  <button className="btn btn--small" onClick={() => setResultFor(phase)}>
                    {t('result.open')}
                  </button>
                )}
              </div>
            </div>

            {/* Une sélection n'a pas de plateau donné d'avance : le joueur
                pioche lui-même dans le référentiel des artistes. Partout
                ailleurs, la liste vient de l'organisateur. */}
            {isWildcardCategory(category) ? (
              <WildcardBoard
                category={category}
                phase={phase}
                order={state.orders[phase.id] ?? []}
                pool={state.pool?.[phase.id] ?? []}
                locked={isLocked}
                onChange={(next) => changeOrder(phase, next)}
                onPool={(next) =>
                  update({ pool: { ...(state.pool ?? {}), [phase.id]: next } })
                }
              />
            ) : RANKING_TYPES.includes(phase.type) ? (
              <RankingBoard
                phase={phase}
                contenders={contenders}
                order={state.orders[phase.id] ?? []}
                locked={isLocked}
                onChange={(order) => changeOrder(phase, order)}
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
                officialDraw={officialDraw}
                onChange={(picks) =>
                  update({ picks: { ...state.picks, [phase.id]: picks } })
                }
              />
            )}

          </section>
        );
      })}

      {/* Une seule fenêtre pour toutes les phases : ce qui change d'une phase à
          l'autre est son contenu, pas sa présence. En monter une par phase
          empilerait autant de pièges à focus et de blocages de défilement, tous
          inertes sauf un.

          La condition est la publication de la PHASE et non la fin de
          l'événement : une compète publie ses wildcards des semaines avant son
          tableau, et attendre la fin rendrait la comparaison muette au moment où
          elle intéresse le plus. La censure côté serveur garantit qu'une phase
          non publiée n'expose ni rangs ni vainqueurs. */}
      {resultFor && (
        <Modal
          wide
          subtitle={`${category.name} — ${resultFor.name}`}
          title={t('result.title')}
          onClose={() => setResultFor(null)}
          footer={
            <button
              className="btn btn--ghost"
              onClick={() => setResultFor(null)}
              style={{ marginLeft: 'auto' }}
            >
              {t('thread.close')}
            </button>
          }
        >
          <PhaseResult
            phase={resultFor}
            contenders={contenders}
            order={state.orders[resultFor.id] ?? []}
            picks={state.picks[resultFor.id] ?? {}}
          />
        </Modal>
      )}
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
  // La poche telle qu'elle a été enregistrée. Les pronostics antérieurs à cette
  // colonne n'en ont pas : `{}` les laisse retomber sur leurs rangs, qui
  // restent la source de vérité de ce qui est classé.
  const pool = saved.pool && typeof saved.pool === 'object' ? saved.pool : {};

  return { orders, picks, pool };
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