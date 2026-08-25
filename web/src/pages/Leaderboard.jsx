import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import ArtistFigure from '../components/ArtistFigure.jsx';
import { Flair, FramedAvatar, Title } from '../components/Cosmetics.jsx';

/**
 * Le classement. Anciennement deux pages — « Classement » et « Statistiques » —
 * qui affichaient le même tableau de joueurs à deux détails près. Elles n'en
 * font plus qu'une : les points en tête, la réussite dans la même ligne, et
 * les lectures de la foule en dessous.
 */
export default function Leaderboard() {
  const [filters, setFilters] = useState({ events: [], kinds: [] });
  const [scope, setScope] = useState('');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // `lang` sert aux cosmétiques : les noms d'objets vivent dans le catalogue,
  // pas dans le dictionnaire, et se choisissent donc à la main.
  const { t, number, lang } = useI18n();

  // Les périmètres disponibles viennent du serveur : tous les formats ayant
  // déjà existé, y compris ceux d'événements passés.
  useEffect(() => {
    // « /scoreboard » et non « /stats » : les bloqueurs de pub coupent les
    // requêtes contenant « /stats? » avant même qu'elles partent.
    api.get('/scoreboard/filters').then(setFilters).catch(() => { });
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    const params = new URLSearchParams();
    if (scope) params.set('event', scope);
    if (kind) params.set('kind', kind);
    const qs = params.toString();

    api
      .get(`/scoreboard${qs ? `?${qs}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scope, kind]);

  // Le rang est calculé AVANT le filtrage et transporté avec la ligne : sinon
  // le premier résultat d'une recherche s'afficherait numéro 1.
  const needle = query.trim().toLowerCase();
  const shown = (data?.players ?? [])
    .map((p, i) => ({ p, rank: i + 1 }))
    .filter(({ p }) => {
      if (!needle) return true;
      const name = `${p.user?.globalName ?? ''} ${p.user?.username ?? ''}`.toLowerCase();
      return name.includes(needle);
    });

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="spread">
        <div>
          <p className="eyebrow">{t('leaderboard.eyebrow')}</p>
          <h1>{t('leaderboard.title')}</h1>
        </div>
        <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="scope">{t('leaderboard.scope')}</label>
            <select id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">{t('leaderboard.scope.all')}</option>
              {filters.events.map((ev) => (
                <option key={ev.slug} value={ev.slug}>{ev.name} {ev.year}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="kind">{t('leaderboard.kind')}</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('leaderboard.kind.all')}</option>
              {filters.kinds.map((k) => (
                <option key={k.kind} value={k.kind}>{t(`kind.${k.kind}`)}</option>
              ))}
            </select>
          </div>
          {/* La recherche filtre la page déjà chargée plutôt que d'interroger
              le serveur : le classement tient en deux cents lignes, et une
              requête par lettre tapée coûterait plus cher que de tout garder
              en mémoire. */}
          <div className="field">
            <label htmlFor="lb-search">{t('leaderboard.search')}</label>
            <input
              id="lb-search"
              type="search"
              value={query}
              placeholder={t('leaderboard.search.hint')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {(scope || kind || query) && (
            <button
              className="btn btn--small btn--ghost"
              onClick={() => { setScope(''); setKind(''); setQuery(''); }}
            >
              {t('common.clear')}
            </button>
          )}
        </div>
      </header>

      {/* Que les lignes mènent quelque part n'allait pas de soi : en test,
          personne n'a pensé à cliquer un pseudo. On le dit. */}
      <p className="faint" style={{ margin: 0 }}>{t('leaderboard.clickable')}</p>

      {error && <p className="notice">{error}</p>}
      {!data && !error && <p className="faint">{t('common.loading')}</p>}

      {data && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Metric value={number(data.totals.players)} label={t('stats.players')} accent />
            <Metric value={number(data.totals.submitted)} label={t('stats.predictions')} />
            <Metric value={number(data.totals.points)} label={t('stats.pointsGiven')} />
            <Metric
              value={data.totals.precision == null ? '—' : `${data.totals.precision} %`}
              label={t('stats.precision')}
            />
          </div>

          {data.players.length === 0 ? (
            <p className="empty">{t('leaderboard.empty')}</p>
          ) : shown.length === 0 ? (
            <p className="empty">{t('leaderboard.search.none', { q: query.trim() })}</p>
          ) : (
            <div className="panel panel--flush">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>{t('leaderboard.col.player')}</th>
                    {/* La moyenne par pronostic a disparu : elle variait
                        surtout avec le nombre de catégories jouées, pas avec
                        l'adresse du pronostiqueur. `col-opt` masque le décompte
                        sous 620 px — il reste lisible sur le profil. */}
                    <th className="num col-opt">{t('stats.col.predictions')}</th>
                    <th className="num">{t('leaderboard.col.points')}</th>
                    <th>{t('stats.col.precision')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ p, rank }) => (
                    <tr key={p.user?.id ?? rank}>
                      <td className="rank-cell">{rank}</td>
                      {/* Cadre, pin et titre. C'est ici qu'ils prennent leur
                          valeur : un cosmétique visible du seul propriétaire ne
                          se vend pas. Chacun ne rend rien quand rien n'est
                          porté — la ligne d'un joueur sans achat est
                          exactement celle d'avant. */}
                      <td>
                        <span className="stat-row">
                          {p.user?.avatarUrl && (
                            <FramedAvatar
                              url={p.user.avatarUrl}
                              frameId={p.user.equippedFrame}
                              size="xs"
                            />
                          )}
                          <span style={{ minWidth: 0 }}>
                            <span className="row" style={{ gap: '0.35rem', alignItems: 'center' }}>
                              <Link to={`/players/${p.user?.id}`}>
                                {p.user?.globalName ?? p.user?.username ?? t('leaderboard.deleted')}
                              </Link>
                              <Flair itemId={p.user?.equippedFlair} size={15} lang={lang} />
                            </span>
                            <Title itemId={p.user?.equippedTitle} lang={lang} inline />
                          </span>
                        </span>
                      </td>
                      <td className="num muted col-opt">{p.predictions}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{p.points}</td>
                      {/* `minWidth` réduit : sur un écran de 360 px, cette
                          seule cellule réclamait un quart de la largeur et
                          poussait le tableau hors du document. */}
                      <td style={{ minWidth: '6rem' }}>
                        {p.precision == null ? (
                          <span className="faint">—</span>
                        ) : (
                          <>
                            {/* Le rapport brut sous le pourcentage : « 62 % »
                                seul ne dit pas s'il repose sur une phase ou sur
                                dix, et c'est ce qui rend deux joueurs
                                comparables ou non. */}
                            <span className="data" style={{ fontSize: '0.78rem' }}>
                              {p.precision} % · {number(p.points)}/{number(p.possible)}
                            </span>
                            <span className="meter">
                              <span style={{ width: `${p.precision}%` }} />
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.readings?.sampled > 0 && (
            <>
              <ReadingBoard
                title={t('stats.wellRead')}
                lede={t('stats.wellRead.lede')}
                rows={data.readings.wellRead}
              />
              <ReadingBoard
                title={t('stats.underRated')}
                lede={t('stats.underRated.lede')}
                rows={data.readings.underRated}
                tone="ok"
              />
              <ReadingBoard
                title={t('stats.overRated')}
                lede={t('stats.overRated.lede')}
                rows={data.readings.overRated}
                tone="warn"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Un palmarès de lecture : ce que la foule attendait face à ce qui s'est
 * produit. L'écart est signé — positif, l'artiste a fini mieux que prévu.
 */
function ReadingBoard({ title, lede, rows, tone }) {
  const { t } = useI18n();
  if (!rows?.length) return null;

  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--r)' : 'var(--accent)';

  return (
    <section className="stack">
      <div>
        <h2>{title}</h2>
        <p className="muted" style={{ fontSize: '0.88rem' }}>{lede}</p>
      </div>
      <div className="panel panel--flush">
        <table>
          <thead>
            <tr>
              <th>{t('stats.col.artist')}</th>
              <th className="num">{t('stats.col.expected')}</th>
              <th className="num">{t('stats.col.actual')}</th>
              <th className="num">{t('stats.col.gap')}</th>
              <th className="num">{t('stats.col.voters')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contenderId}>
                <td>
                  <span className="stat-row">
                    <ArtistFigure src={r.imageUrl} name={r.name} size="xs" />
                    <span>
                      {r.name}
                      <span className="faint data" style={{ fontSize: '0.78rem', display: 'block' }}>
                        {r.event} · {r.category}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="num muted">{r.expected}</td>
                <td className="num">{r.actual}</td>
                <td className="num" style={{ color, fontWeight: 600 }}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </td>
                <td className="num muted">{r.voters}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ value, label, accent }) {
  return (
    <div className="panel">
      <p
        className="display"
        style={{
          fontSize: 'calc(2.2rem * var(--display-scale))',
          color: accent ? 'var(--accent)' : 'inherit',
        }}
      >
        {value}
      </p>
      <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{label}</p>
    </div>
  );
}