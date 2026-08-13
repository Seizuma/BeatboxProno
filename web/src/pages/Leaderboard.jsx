import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import ArtistFigure from '../components/ArtistFigure.jsx';

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
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { t, number } = useI18n();

  // Les périmètres disponibles viennent du serveur : tous les formats ayant
  // déjà existé, y compris ceux d'événements passés.
  useEffect(() => {
    api.get('/stats/filters').then(setFilters).catch(() => { });
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    const params = new URLSearchParams();
    if (scope) params.set('event', scope);
    if (kind) params.set('kind', kind);
    const qs = params.toString();

    api
      .get(`/stats${qs ? `?${qs}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scope, kind]);

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
          {(scope || kind) && (
            <button className="btn btn--small btn--ghost" onClick={() => { setScope(''); setKind(''); }}>
              {t('common.clear')}
            </button>
          )}
        </div>
      </header>

      {error && <p className="notice">{error}</p>}
      {!data && !error && <p className="faint">{t('common.loading')}</p>}

      {data && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Metric value={number(data.totals.players)} label={t('stats.players')} accent />
            <Metric value={number(data.totals.submitted)} label={t('stats.predictions')} />
            <Metric value={number(data.totals.points)} label={t('stats.pointsGiven')} />
            <Metric
              value={data.totals.accuracy == null ? '—' : `${data.totals.accuracy} %`}
              label={t('stats.battlesRead')}
            />
          </div>

          {data.players.length === 0 ? (
            <p className="empty">{t('leaderboard.empty')}</p>
          ) : (
            <div className="panel panel--flush">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>{t('leaderboard.col.player')}</th>
                    <th className="num">{t('stats.col.predictions')}</th>
                    <th className="num">{t('leaderboard.col.points')}</th>
                    <th className="num">{t('stats.col.average')}</th>
                    <th>{t('stats.col.accuracy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.players.map((p, i) => (
                    <tr key={p.user?.id ?? i}>
                      <td className="rank-cell">{i + 1}</td>
                      <td>
                        <span className="stat-row">
                          {p.user?.avatarUrl && <img className="avatar" src={p.user.avatarUrl} alt="" />}
                          <Link to={`/players/${p.user?.id}`}>
                            {p.user?.globalName ?? p.user?.username ?? t('leaderboard.deleted')}
                          </Link>
                        </span>
                      </td>
                      <td className="num muted">{p.predictions}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{p.points}</td>
                      <td className="num muted">{p.average ?? '—'}</td>
                      <td style={{ minWidth: '9rem' }}>
                        {p.accuracy == null ? (
                          <span className="faint">—</span>
                        ) : (
                          <>
                            <span className="data" style={{ fontSize: '0.78rem' }}>
                              {p.accuracy} % · {p.battleHits}/{p.battlePicks}
                            </span>
                            <span className="meter">
                              <span style={{ width: `${p.accuracy}%` }} />
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