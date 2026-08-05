import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';

const STATUS = {
  DRAFT: { label: 'Brouillon', cls: '' },
  OPEN: { label: 'Pronostics ouverts', cls: 'tag--live' },
  LIVE: { label: 'En cours', cls: 'tag--live' },
  FINISHED: { label: 'Terminé', cls: 'tag--done' },
};

export default function Home() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const { user } = useSession();

  useEffect(() => {
    api.get('/events').then(({ events }) => setEvents(events)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="stack" style={{ paddingTop: '2.5rem' }}>
      {params.get('auth') === 'echec' && (
        <p className="notice">
          La connexion Discord n'a pas abouti. Relancez-la depuis le bouton en haut à droite.
        </p>
      )}

      <header style={{ maxWidth: '46ch' }}>
        <p className="eyebrow">Pronostics beatbox</p>
        <h1>Pariez sur les battles, pas sur la chance.</h1>
        <p className="muted" style={{ marginTop: '0.9rem' }}>
          Composez le classement des wildcards, dessinez l'arbre jusqu'à la finale, annoncez
          les scores. Chaque bonne intuition rapporte des points, même quand l'affiche
          arrive par un autre chemin que prévu.
        </p>
        {!user && (
          <a className="btn btn--primary" href={api.loginUrl} style={{ marginTop: '1rem', display: 'inline-block' }}>
            Se connecter avec Discord
          </a>
        )}
      </header>

      <hr style={{ border: 0, borderTop: 'var(--frame)', margin: '1rem 0 0' }} />

      <section className="stack">
        <div className="spread">
          <h2>Événements</h2>
          {events && <span className="data faint">{events.length} au calendrier</span>}
        </div>

        {error && <p className="notice">{error}</p>}
        {!events && !error && <p className="faint">Chargement…</p>}
        {events?.length === 0 && (
          <p className="empty">Aucun événement publié pour l'instant. Revenez bientôt.</p>
        )}

        <div className="grid">
          {events?.map((ev) => {
            const s = STATUS[ev.status];
            return (
              <Link className="event-card" to={`/evenements/${ev.slug}`} key={ev.id}>
                <p className="event-card__year data">{ev.year}</p>
                <h3 style={{ margin: '0.4rem 0' }}>{ev.name}</h3>
                <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.7rem' }}>
                  {ev.location ?? 'Lieu à confirmer'}
                </p>
                <div className="row" style={{ gap: '0.35rem' }}>
                  <span className={`tag ${s.cls}`}>{s.label}</span>
                  {ev.categories.map((c) => (
                    <span className="tag" key={c.id}>{c.name}</span>
                  ))}
                </div>
                <p className="data faint" style={{ fontSize: '0.75rem', marginBottom: 0, marginTop: '0.7rem' }}>
                  {ev._count.predictions} pronostics déposés
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
