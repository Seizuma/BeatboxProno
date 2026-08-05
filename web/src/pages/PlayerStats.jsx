import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import ArtistFigure from '../components/ArtistFigure.jsx';

/**
 * La page qui manquait : ce que valent les joueurs, pas seulement combien de
 * points ils ont. Le classement dit qui gagne ; ici on voit comment.
 */
export default function PlayerStats() {
  const [events, setEvents] = useState([]);
  const [scope, setScope] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { t, number } = useI18n();

  useEffect(() => {
    api.get('/events').then(({ events }) => setEvents(events)).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .get(`/stats${scope ? `?event=${scope}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scope]);

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="spread">
        <div>
          <p className="eyebrow">{t('stats.eyebrow')}</p>
          <h1>{t('stats.title')}</h1>
        </div>
        <div>
          <label htmlFor="stats-scope">{t('leaderboard.scope')}</label>
          <select id="stats-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t('leaderboard.scope.all')}</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.slug}>{ev.name} {ev.year}</option>
            ))}
          </select>
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

          <section className="stack">
            <h2>{t('stats.table.title')}</h2>
            {data.players.length === 0 ? (
              <p className="empty">{t('stats.empty')}</p>
            ) : (
              <div className="panel panel--flush">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>{t('stats.col.player')}</th>
                      <th className="num">{t('stats.col.predictions')}</th>
                      <th className="num">{t('stats.col.points')}</th>
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
                            {p.user?.avatarUrl && (
                              <img className="avatar" src={p.user.avatarUrl} alt="" />
                            )}
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
          </section>

          {data.favourites.length > 0 && (
            <section className="stack">
              <div>
                <h2>{t('stats.favourites')}</h2>
                <p className="muted" style={{ fontSize: '0.88rem' }}>{t('stats.favourites.lede')}</p>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
              >
                {data.favourites.map((f) => (
                  <div className="artist-card" key={f.contenderId}>
                    <ArtistFigure src={f.imageUrl} name={f.name} size="md" />
                    <span style={{ minWidth: 0 }}>
                      <h3>{f.name}</h3>
                      <p className="data faint">
                        {f.event} · {f.category}
                      </p>
                      <p className="data" style={{ color: 'var(--accent)', fontSize: '0.72rem' }}>
                        {t('stats.favourites.count', { n: f.count })}
                      </p>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
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
