import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

export default function Leaderboard() {
  const [events, setEvents] = useState([]);
  const [scope, setScope] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const { t } = useI18n();

  useEffect(() => {
    api.get('/events').then(({ events }) => setEvents(events)).catch(() => {});
  }, []);

  useEffect(() => {
    setRows(null);
    api
      .get(`/leaderboard${scope ? `?event=${scope}` : ''}`)
      .then(({ leaderboard }) => setRows(leaderboard))
      .catch((e) => setError(e.message));
  }, [scope]);

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="spread">
        <div>
          <p className="eyebrow">{t('leaderboard.eyebrow')}</p>
          <h1>{t('leaderboard.title')}</h1>
        </div>
        <div>
          <label htmlFor="scope">{t('leaderboard.scope')}</label>
          <select id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t('leaderboard.scope.all')}</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.slug}>{ev.name} {ev.year}</option>
            ))}
          </select>
        </div>
      </header>

      {error && <p className="notice">{error}</p>}
      {!rows && !error && <p className="faint">{t('common.loading')}</p>}
      {rows?.length === 0 && <p className="empty">{t('leaderboard.empty')}</p>}

      {rows?.length > 0 && (
        <>
          <div className="panel panel--flush">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>{t('leaderboard.col.player')}</th>
                  <th className="num">{t('leaderboard.col.predictions')}</th>
                  <th className="num">{t('leaderboard.col.points')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user?.id ?? r.position}>
                    <td className="rank-cell">{r.position}</td>
                    <td>
                      <span className="row" style={{ gap: '0.55rem' }}>
                        {r.user?.avatarUrl && <img className="avatar" src={r.user.avatarUrl} alt="" />}
                        <Link to={`/players/${r.user?.id}`}>
                          {r.user?.globalName ?? r.user?.username ?? t('leaderboard.deleted')}
                        </Link>
                      </span>
                    </td>
                    <td className="num muted">{r.predictions}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ margin: 0 }}>
            <Link to="/stats">{t('leaderboard.tostats')} →</Link>
          </p>
        </>
      )}
    </div>
  );
}
