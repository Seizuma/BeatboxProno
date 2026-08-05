import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export function ArtistList() {
  const [artists, setArtists] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/artists').then(({ artists }) => setArtists(artists)).catch(() => setArtists([]));
  }, []);

  const shown = artists?.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="spread">
        <div>
          <p className="eyebrow">Réutilisables d'un événement à l'autre</p>
          <h1>Artistes</h1>
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un nom"
          aria-label="Chercher un artiste"
        />
      </header>

      {!artists && <p className="faint">Chargement…</p>}
      {shown?.length === 0 && <p className="empty">Aucun artiste ne correspond.</p>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {shown?.map((a) => (
          <Link className="event-card" to={`/artistes/${a.slug}`} key={a.id}>
            <h3>{a.name}</h3>
            <p className="data faint" style={{ margin: 0, fontSize: '0.75rem' }}>{a.country ?? '—'}</p>
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

  useEffect(() => {
    api.get(`/artists/${slug}`).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>Chargement…</p>;

  const { artist, record, crowd, appearances } = data;

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header>
        <p className="eyebrow">{artist.country ?? 'Origine inconnue'}</p>
        <h1>{artist.name}</h1>
        {artist.bio && <p className="muted" style={{ maxWidth: '60ch' }}>{artist.bio}</p>}
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Metric value={`${record.wins}–${record.losses}`} label="Bilan en battle" accent />
        <Metric value={record.podiums} label="Podiums" />
        <Metric value={crowd.timesPickedToWinBattle} label="Fois donné vainqueur" />
        <Metric
          value={crowd.accuracy == null ? '—' : `${crowd.accuracy} %`}
          label="Réussite de ceux qui l'ont pris"
        />
      </div>

      <section className="stack">
        <h2>Participations</h2>
        {appearances.length === 0 ? (
          <p className="empty">Pas encore engagé sur un événement enregistré.</p>
        ) : (
          <div className="panel panel--flush">
            <table>
              <thead>
                <tr>
                  <th>Événement</th><th>Catégorie</th><th>Sous le nom de</th><th className="num">Seed</th>
                </tr>
              </thead>
              <tbody>
                {appearances.map((a, i) => (
                  <tr key={i}>
                    <td><Link to={`/evenements/${a.eventSlug}`}>{a.event}</Link></td>
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
      <p className="display" style={{ fontSize: 'calc(2.2rem * var(--display-scale))', color: accent ? 'var(--accent)' : 'inherit' }}>
        {value}
      </p>
      <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{label}</p>
    </div>
  );
}
