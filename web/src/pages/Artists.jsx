import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import ArtistFigure from '../components/ArtistFigure.jsx';

export function ArtistList() {
  const [artists, setArtists] = useState(null);
  const [q, setQ] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    api.get('/artists').then(({ artists }) => setArtists(artists)).catch(() => setArtists([]));
  }, []);

  const shown = artists?.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="spread">
        <div>
          <p className="eyebrow">{t('artists.eyebrow')}</p>
          <h1>{t('artists.title')}</h1>
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('artists.search')}
          aria-label={t('artists.search')}
        />
      </header>

      {!artists && <p className="faint">{t('common.loading')}</p>}
      {shown?.length === 0 && <p className="empty">{t('artists.empty')}</p>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {shown?.map((a) => (
          <Link className="artist-card" to={`/artists/${a.slug}`} key={a.id}>
            <ArtistFigure src={a.imageUrl} name={a.name} size="md" />
            <span style={{ minWidth: 0 }}>
              <h3>{a.name}</h3>
              <p className="data faint">{a.country ?? '—'}</p>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ArtistPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { t } = useI18n();

  useEffect(() => {
    api.get(`/artists/${slug}`).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

  const { artist, record, crowd, appearances } = data;

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="row" style={{ gap: '1.1rem', alignItems: 'center' }}>
        <ArtistFigure src={artist.imageUrl} name={artist.name} size="lg" />
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">{artist.country ?? t('artists.unknown')}</p>
          <h1>{artist.name}</h1>
          {artist.bio && <p className="muted" style={{ maxWidth: '60ch' }}>{artist.bio}</p>}
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Metric value={`${record.wins}–${record.losses}`} label={t('artists.record')} accent />
        <Metric value={record.podiums} label={t('artists.podiums')} />
        <Metric value={crowd.timesPickedToWinBattle} label={t('artists.pickedToWin')} />
        <Metric
          value={crowd.accuracy == null ? '—' : `${crowd.accuracy} %`}
          label={t('artists.accuracy')}
        />
      </div>

      <section className="stack">
        <h2>{t('artists.appearances')}</h2>
        {appearances.length === 0 ? (
          <p className="empty">{t('artists.appearances.empty')}</p>
        ) : (
          <div className="panel panel--flush">
            <table>
              <thead>
                <tr>
                  <th>{t('artists.col.event')}</th>
                  <th>{t('artists.col.category')}</th>
                  <th>{t('artists.col.as')}</th>
                  <th className="num">{t('common.seed')}</th>
                </tr>
              </thead>
              <tbody>
                {appearances.map((a, i) => (
                  <tr key={i}>
                    <td><Link to={`/events/${a.eventSlug}`}>{a.event}</Link></td>
                    <td className="muted">{a.category}</td>
                    <td>{a.contender}</td>
                    <td className="num">{a.seed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
