import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import DiscordButton from '../components/DiscordButton.jsx';

export default function Profile() {
  const { id } = useParams();
  const { user, loading } = useSession();
  const targetId = id ?? user?.id;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!targetId) return;
    api.get(`/users/${targetId}`).then(setData).catch((e) => setError(e.message));
  }, [targetId]);

  if (loading) return <p className="faint" style={{ marginTop: '2rem' }}>Chargement…</p>;
  if (!targetId) {
    return (
      <div className="empty" style={{ marginTop: '3rem' }}>
        <p>Connectez-vous pour retrouver vos pronostics.</p>
        <DiscordButton />
      </div>
    );
  }
  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>Chargement…</p>;

  const buckets = {
    'En cours': data.predictions.filter((p) => p.submitted && !p.scoredAt),
    Terminés: data.predictions.filter((p) => p.scoredAt),
    Brouillons: data.predictions.filter((p) => !p.submitted),
  };

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      <header className="row" style={{ gap: '1rem' }}>
        {data.user.avatarUrl && <img className="avatar avatar--lg" src={data.user.avatarUrl} alt="" />}
        <div>
          <p className="eyebrow">
            Inscrit depuis {new Date(data.user.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </p>
          <h1>{data.user.globalName ?? data.user.username}</h1>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat value={data.totals.points} label="Points cumulés" accent />
        <Stat value={data.totals.finished} label="Pronostics scorés" />
        <Stat value={data.totals.pending} label="En attente de résultat" />
        <Stat value={data.totals.drafts} label="Brouillons" />
      </div>

      {Object.entries(buckets).map(([title, rows]) => (
        <section className="stack" key={title}>
          <h2>{title}</h2>
          {rows.length === 0 ? (
            <p className="empty">Rien ici pour l'instant.</p>
          ) : (
            <div className="panel panel--flush">
              <table>
                <thead>
                  <tr>
                    <th>Événement</th>
                    <th>Catégorie</th>
                    <th className="num">Points</th>
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
                        <Link to={`/evenements/${p.event.slug}`}>Ouvrir</Link>
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
