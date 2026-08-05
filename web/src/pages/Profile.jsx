import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import DiscordButton from '../components/DiscordButton.jsx';

export default function Profile() {
  const { id } = useParams();
  const { user, loading } = useSession();
  const { t, date } = useI18n();
  const targetId = id ?? user?.id;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!targetId) return;
    api.get(`/users/${targetId}`).then(setData).catch((e) => setError(e.message));
  }, [targetId]);

  if (loading) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;
  if (!targetId) {
    return (
      <div className="empty" style={{ marginTop: '3rem' }}>
        <p>{t('profile.signin')}</p>
        <DiscordButton />
      </div>
    );
  }
  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

  const buckets = [
    ['profile.bucket.live', data.predictions.filter((p) => p.submitted && !p.scoredAt)],
    ['profile.bucket.done', data.predictions.filter((p) => p.scoredAt)],
    ['profile.bucket.drafts', data.predictions.filter((p) => !p.submitted)],
  ];

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="row" style={{ gap: '1rem' }}>
        {data.user.avatarUrl && <img className="avatar avatar--lg" src={data.user.avatarUrl} alt="" />}
        <div>
          <p className="eyebrow">
            {t('profile.member', {
              date: date(data.user.createdAt, { month: 'long', year: 'numeric' }),
            })}
          </p>
          <h1>{data.user.globalName ?? data.user.username}</h1>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat value={data.totals.points} label={t('profile.points')} accent />
        <Stat value={data.totals.finished} label={t('profile.scored')} />
        <Stat value={data.totals.pending} label={t('profile.pending')} />
        <Stat value={data.totals.drafts} label={t('profile.drafts')} />
      </div>

      {buckets.map(([titleKey, rows]) => (
        <section className="stack" key={titleKey}>
          <h2>{t(titleKey)}</h2>
          {rows.length === 0 ? (
            <p className="empty">{t('profile.bucket.empty')}</p>
          ) : (
            <div className="panel panel--flush">
              <table>
                <thead>
                  <tr>
                    <th>{t('artists.col.event')}</th>
                    <th>{t('artists.col.category')}</th>
                    <th className="num">{t('leaderboard.col.points')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>{p.event.name} {p.event.year}</td>
                      <td className="muted">{p.category.name}</td>
                      <td className="num">{p.scoredAt ? p.points : '—'}</td>
                      <td className="num">
                        <Link to={`/events/${p.event.slug}`}>{t('common.open')}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Stat({ value, label, accent }) {
  return (
    <div className="panel">
      <p
        className="display"
        style={{ fontSize: 'calc(2.6rem * var(--display-scale))', color: accent ? 'var(--accent)' : 'inherit' }}
      >
        {value}
      </p>
      <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{label}</p>
    </div>
  );
}
