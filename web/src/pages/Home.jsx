import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { localName } from '../lib/localName.js';
import DiscordButton from '../components/DiscordButton.jsx';
import ScoringHelp from '../components/ScoringHelp.jsx';
import PostboxDialog from '../components/PostboxDialog.jsx';

const STATUS_CLASS = {
  DRAFT: '',
  OPEN: 'tag--live',
  // Jaune, pas vert : « en cours » signifie que la compétition a commencé et
  // que les pronostics sont FERMÉS — le vert laissait croire l'inverse.
  LIVE: 'tag--now',
  FINISHED: 'tag--done',
};

/** Ce qu'on montre avant de replier. Voir `VISIBLE` plus bas. */
const VISIBLE = 4;

/**
 * Au-dessous de trois compètes ouvertes, pas de vedettes.
 *
 * Mettre deux compètes en avant sur deux, c'est les afficher deux fois. La
 * section ne dit quelque chose que lorsqu'elle CHOISIT, donc à partir du moment
 * où il y a plus de deux candidates.
 */
const FEATURE_FROM = 3;

/**
 * Dans combien de temps ferme cette compète ?
 *
 * ─── Pourquoi rien au-delà de 72 h ──────────────────────────────────────────
 *
 * « Ferme dans trois semaines » n'apprend rien et dilue les pastilles qui, elles,
 * veulent dire quelque chose. Une information d'urgence qui s'affiche tout le
 * temps cesse d'être une information d'urgence.
 *
 * ─── Pourquoi trois unités ──────────────────────────────────────────────────
 *
 * « Ferme dans 0 h » est ce que donnerait un calcul en heures dans la dernière
 * heure, et c'est précisément le moment où la phrase compte le plus. « Ferme
 * dans 47 h » se lit moins vite que « dans 2 j ».
 *
 * @returns {{label:string, urgent:boolean}|null}
 */
function closesIn(iso, now, t) {
  if (!iso) return null;

  const ms = new Date(iso).getTime() - now;
  // Déjà passé : c'est au statut de le dire, pas à un compte à rebours négatif.
  if (ms <= 0) return null;

  const minutes = Math.floor(ms / 60000);
  if (minutes >= 72 * 60) return null;

  if (minutes < 60) return { label: t('home.closes.minutes', { n: minutes }), urgent: true };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: t('home.closes.hours', { n: hours }), urgent: true };

  // Arrondi au SUPÉRIEUR : à 25 h il reste bien deux jours à tenir, pas un.
  return { label: t('home.closes.days', { n: Math.ceil(hours / 24) }), urgent: false };
}

/**
 * Les trois tris proposés, et ce que chacun répond.
 *
 * `soon` par défaut : c'est la seule question qui a une réponse urgente — les
 * autres compètes seront encore là demain. Une compète sans date butoir passe
 * en dernier plutôt qu'en premier : ne rien savoir n'est pas une urgence.
 */
const SORTS = {
  soon: (a, b) =>
    (a.predictionsCloseAt ? new Date(a.predictionsCloseAt).getTime() : Infinity) -
    (b.predictionsCloseAt ? new Date(b.predictionsCloseAt).getTime() : Infinity),
  hot: (a, b) => b._count.predictions - a._count.predictions,
  fresh: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
};

/**
 * La page « Événements ». Ce qu'on vient y chercher, c'est où pronostiquer :
 * les événements ouverts passent donc avant tout le reste, et l'accroche se
 * réduit à un bandeau. Les catégories ne sont plus listées ici — elles
 * appartiennent à la page de l'événement, pas à son annonce.
 */
export default function Home() {
  const [events, setEvents] = useState(null);
  const [sort, setSort] = useState('soon');
  const [expanded, setExpanded] = useState(false);
  /**
   * L'heure, rafraîchie chaque minute.
   *
   * Les comptes à rebours seraient sinon figés à l'ouverture de la page : un
   * onglet laissé ouvert toute la soirée afficherait encore « ferme dans 3 h »
   * après la fermeture. Une minute suffit — la plus petite unité affichée.
   */
  const [now, setNow] = useState(() => Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  const [postboxOpen, setPostboxOpen] = useState(false);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const { user } = useSession();
  const { t, number, lang } = useI18n();

  useEffect(() => {
    api.get('/events').then(({ events }) => setEvents(events)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const open = events?.filter((e) => ['OPEN', 'LIVE'].includes(e.status)) ?? [];
  const rest = events?.filter((e) => !['OPEN', 'LIVE'].includes(e.status)) ?? [];
  const total = events?.reduce((n, e) => n + e._count.predictions, 0) ?? 0;

  /**
   * Les candidates aux vedettes : celles où l'on peut ENCORE déposer.
   *
   * `LIVE` est écarté — la compétition a commencé, les pronostics sont fermés,
   * et mettre en avant une porte close serait une promesse en l'air. La date
   * butoir dépassée l'est aussi, pour la même raison : le statut peut n'avoir
   * pas encore été basculé à la main.
   */
  const playable = open.filter(
    (e) =>
      e.status === 'OPEN' &&
      (!e.predictionsCloseAt || new Date(e.predictionsCloseAt).getTime() > now)
  );

  const hot = playable.length >= FEATURE_FROM
    ? [...playable].sort(SORTS.hot)[0]
    : null;
  const fresh = playable.length >= FEATURE_FROM
    ? [...playable].sort(SORTS.fresh)[0]
    : null;

  /**
   * Une carte par compète, pas une par titre.
   *
   * La plus jouée EST souvent la dernière ouverte — c'est le cas de toute
   * compète qui ouvre en fanfare. Deux cartes identiques côte à côte se
   * liraient comme un défaut ; une seule carte portant ses deux pastilles dit
   * la même chose et se comprend.
   */
  const featured = [];
  if (hot) featured.push({ event: hot, flags: hot.id === fresh?.id ? ['hot', 'new'] : ['hot'] });
  if (fresh && fresh.id !== hot?.id) featured.push({ event: fresh, flags: ['new'] });

  /**
   * La liste reste COMPLÈTE, vedettes comprises.
   *
   * On aurait pu les en retirer. À dix compètes c'est sans conséquence, mais à
   * trois la section « Ouvert maintenant » n'aurait plus qu'une ligne et
   * ressemblerait à une erreur. « À la une » est un raccourci, pas un tiroir
   * dans lequel on range : la liste en dessous doit rester l'inventaire.
   */
  const sorted = [...open].sort(SORTS[sort] ?? SORTS.soon);
  const shown = expanded ? sorted : sorted.slice(0, VISIBLE);
  const hidden = sorted.length - shown.length;

  return (
    <>
      {['echec', 'failed'].includes(params.get('auth')) && (
        <p className="notice" style={{ marginTop: '1.5rem' }}>{t('home.auth.failed')}</p>
      )}

      {/* Un compte fermé n'est pas une panne de connexion. Le dire « échec »
          enverrait la personne réessayer en boucle. Le motif n'est pas donné :
          il ne regarde que l'administration, et le contester se fait par la
          boîte à idées, pas en relançant Discord. */}
      {params.get('auth') === 'banned' && (
        <p className="notice" style={{ marginTop: '1.5rem' }}>{t('home.auth.banned')}</p>
      )}

      <section className="hero">
        <p className="silkscreen">{t('home.eyebrow')}</p>
        <div className="hero__band">
          <h1 className="hero__title">
            {t('home.title.l1')}
            <br />
            {t('home.title.l2a')}
            <em>{t('home.title.em')}</em>
            {t('home.title.l2b')}
          </h1>
          <div className="stack" style={{ gap: '0.9rem' }}>
            <p className="hero__lede">{t('home.lede')}</p>
            <div className="row" style={{ gap: '1rem' }}>
              {!user && <DiscordButton />}
              <button className="btn btn--small" onClick={() => setHelpOpen(true)}>
                ? {t('help.open')}
              </button>
              {total > 0 && (
                <span className="readout">
                  <span className="readout__value">{number(total)}</span>
                  <span className="readout__unit">{t('home.counter')}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="notice">{error}</p>}
      {!events && !error && <p className="silkscreen">{t('common.loading')}</p>}

      {/* À la une.

          La page listait toutes les compètes ouvertes les unes sous les
          autres. À quatre c'était lisible ; à dix ce serait un mur où rien ne
          ressort, et la question qu'on vient poser — « où puis-je jouer
          maintenant ? » — n'aurait plus de réponse immédiate.

          Deux réponses, donc : celle où le monde est déjà, et celle qui vient
          d'arriver. */}
      {featured.length > 0 && (
        <section>
          <div className="spread" style={{ marginBottom: '0.9rem' }}>
            <h2>{t('home.featured')}</h2>
          </div>

          <div className="feature-grid">
            {featured.map(({ event: ev, flags }) => {
              const closing = closesIn(ev.predictionsCloseAt, now, t);
              return (
                <Link className={`feature feature--${flags[0] === 'hot' ? 'hot' : 'new'}`} to={`/events/${ev.slug}`} key={ev.id}>
                  <span className="feature__flags">
                    {flags.map((f) => (
                      <span className="feature__flag" key={f}>{t(`home.flag.${f}`)}</span>
                    ))}
                  </span>

                  <h3 className="feature__title">{ev.name} {ev.year}</h3>

                  <p className="feature__meta">
                    {[ev.location ?? t('home.venue.tbc'), ...ev.categories.map((c) => localName(c, lang))].join(' · ')}
                  </p>

                  <span className="rail__meta">
                    <span className={`tag ${STATUS_CLASS[ev.status] ?? ''}`}>{t(`status.${ev.status}`)}</span>
                    {closing && (
                      <span className={`tag ${closing.urgent ? 'tag--urgent' : 'tag--now'}`}>{closing.label}</span>
                    )}
                  </span>

                  <span className="feature__foot">
                    <span className="readout">
                      <span className="readout__value">{ev._count.predictions}</span>
                      <span className="readout__unit">{t('home.predictions.short')}</span>
                    </span>
                    <span className="btn btn--primary btn--small">{t('home.cta.predict.short')}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Ce sur quoi on peut parier maintenant. */}
      {events && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="spread" style={{ marginBottom: '0.9rem' }}>
            <h2>{t('home.open')}</h2>
            {/* Le tri n'apparaît que lorsqu'il a quelque chose à trier : sur
                deux compètes, un sélecteur à trois options est un contrôle qui
                demande une décision sans en offrir l'enjeu. */}
            {open.length > VISIBLE ? (
              <span className="sorter">
                <label htmlFor="home-sort">{t('home.sort')}</label>
                <select id="home-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="soon">{t('home.sort.soon')}</option>
                  <option value="hot">{t('home.sort.hot')}</option>
                  <option value="fresh">{t('home.sort.fresh')}</option>
                </select>
              </span>
            ) : (
              open.length > 0 && <span className="silkscreen">{open.length}</span>
            )}
          </div>

          {open.length === 0 ? (
            <div className="empty">
              <p style={{ margin: 0, color: 'var(--ink)' }}>{t('home.open.none')}</p>
              <p style={{ margin: '0.3rem 0 0' }}>{t('home.open.none.lede')}</p>
            </div>
          ) : (
            shown.map((ev) => {
              const closing = closesIn(ev.predictionsCloseAt, now, t);
              return (
              <Link className="rail rail--open" to={`/events/${ev.slug}`} key={ev.id}>
                <span className="rail__year">{ev.year}</span>
                <span>
                  <h3 className="rail__title">{ev.name}</h3>
                  <span className="rail__meta">
                    <span className={`tag ${STATUS_CLASS[ev.status] ?? ''}`}>{t(`status.${ev.status}`)}</span>
                    {/* Le compte à rebours passe AVANT les catégories : il
                        décide si l'on clique aujourd'hui, elles disent
                        seulement ce qu'on y trouvera. */}
                    {closing && (
                      <span className={`tag ${closing.urgent ? 'tag--urgent' : 'tag--now'}`}>{closing.label}</span>
                    )}
                    {ev.categories.map((c) => (
                      <span className="tag" key={c.id}>{localName(c, lang)}</span>
                    ))}
                  </span>
                </span>
                <span className="rail__aside">
                  {/* En cours : on peut suivre l'événement et relire ses
                      pronos, mais plus en déposer — le bouton dit « voir »,
                      pas « jouer ». */}
                  {ev.status === 'LIVE' ? (
                    <span className="btn btn--small">
                      {t('home.cta.browse')}
                    </span>
                  ) : (
                    <span className="btn btn--primary btn--small">
                      {t('home.cta.predict', { event: `${ev.name} ${ev.year}` })}
                    </span>
                  )}
                  <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
                    {ev.location ?? t('home.venue.tbc')} · {ev._count.predictions} {t('home.predictions.short')}
                  </p>
                </span>
              </Link>
              );
            })
          )}

          {/* Le dépli. Une seule fois, sans repli : personne n'a jamais voulu
              refermer une liste qu'il venait d'ouvrir. */}
          {hidden > 0 && (
            <button className="btn btn--ghost more" onClick={() => setExpanded(true)}>
              {t('home.more', { n: hidden })}
            </button>
          )}
        </section>
      )}

      {/* Le reste du calendrier : archives, à-venir, et — pour le staff
          seulement — les brouillons, signalés comme tels. L'API ne les envoie
          jamais aux autres comptes. */}
      {rest.length > 0 && (
        <section>
          <div className="spread" style={{ marginBottom: '0.9rem' }}>
            <h2>{t('home.events')}</h2>
            <span className="silkscreen">{t('home.events.count', { n: rest.length })}</span>
          </div>

          {rest.map((ev) => (
            <Link
              className={`rail${ev.status === 'DRAFT' ? ' rail--draft' : ''}`}
              to={`/events/${ev.slug}`}
              key={ev.id}
            >
              <span className="rail__year">{ev.year}</span>
              <span>
                <h3 className="rail__title">{ev.name}</h3>
                <span className="rail__meta">
                  <span className={`tag ${STATUS_CLASS[ev.status] ?? ''}`}>{t(`status.${ev.status}`)}</span>
                  {ev.status === 'DRAFT' && <span className="tag tag--draft">{t('home.draft.hint')}</span>}
                  {ev.categories.map((c) => (
                    <span className="tag" key={c.id}>{localName(c, lang)}</span>
                  ))}
                </span>
              </span>
              <span className="rail__aside">
                <span className="readout">
                  <span className="readout__value">{ev._count.predictions}</span>
                  <span className="readout__unit">{t('home.predictions.short')}</span>
                </span>
                <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
                  {ev.location ?? t('home.venue.tbc')}
                </p>
              </span>
            </Link>
          ))}
        </section>
      )}

      {events?.length === 0 && <p className="empty">{t('home.events.empty')}</p>}

      {/* Réservé aux comptes connectés : sans identité Discord, pas de quota
          possible et pas de réponse possible non plus. Le bouton n'est donc pas
          grisé, il n'existe simplement pas.

          Flottant plutôt que dans le bandeau : écrire au site n'est pas une
          étape du parcours, c'est un recours. Il doit rester atteignable sans
          jamais disputer la place à « Faire mes pronos ». */}
      {user && !postboxOpen && (
        <button
          className="fab"
          onClick={() => setPostboxOpen(true)}
          aria-haspopup="dialog"
          title={t('postbox.open')}
        >
          <span className="fab__mark" aria-hidden="true">✉</span>
          <span className="fab__label">{t('postbox.open')}</span>
        </button>
      )}

      {/* Aucune catégorie ouverte ici : on montre les deux barèmes. L'accueil
          n'ouvrait que celui des tableaux, ce qui rendait celui des sélections
          introuvable tant qu'aucune compétition de wildcards n'était en cours. */}
      {helpOpen && <ScoringHelp mode="all" onClose={() => setHelpOpen(false)} />}
      {postboxOpen && user && <PostboxDialog onClose={() => setPostboxOpen(false)} />}
    </>
  );
}