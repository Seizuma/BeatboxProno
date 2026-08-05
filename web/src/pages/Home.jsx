import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import DiscordButton from '../components/DiscordButton.jsx';

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

  // L'événement mis en avant : le premier ouvert, sinon le plus récent.
  const featured =
    events?.find((e) => ['OPEN', 'LIVE'].includes(e.status)) ?? events?.[0] ?? null;
  const total = events?.reduce((n, e) => n + e._count.predictions, 0) ?? 0;

  return (
    <>
      {params.get('auth') === 'echec' && (
        <p className="notice" style={{ marginTop: '1.5rem' }}>
          La connexion Discord n'a pas abouti. Relancez-la depuis le bouton en haut à droite.
        </p>
      )}

      <section className="hero">
        <div>
          <p className="silkscreen">Pronostics beatbox</p>
          <h1 className="hero__title">
            Pariez sur les battles,<br />pas sur la <em>chance</em>.
          </h1>
          <p className="hero__lede">
            Composez le classement des wildcards, dessinez l'arbre jusqu'à la finale,
            annoncez les scores. Chaque bonne intuition rapporte, même quand l'affiche
            arrive par un autre chemin que prévu.
          </p>
          <div className="row" style={{ marginTop: '1.75rem', gap: '1rem' }}>
            {user ? (
              featured && (
                <Link className="btn btn--primary" to={`/evenements/${featured.slug}`}>
                  Pronostiquer {featured.name} {featured.year}
                </Link>
              )
            ) : (
              <DiscordButton />
            )}
            {total > 0 && (
              <span className="readout">
                <span className="readout__value">{total}</span>
                <span className="readout__unit">pronostics déposés</span>
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="silkscreen" style={{ marginBottom: '0.6rem' }}>
            {featured ? `${featured.name} ${featured.year} — catégories` : 'Catégories'}
          </p>
          <div className="pads">
            {Array.from({ length: 6 }, (_, i) => {
              const cat = featured?.categories[i];
              if (!cat) {
                return <span className="pad pad--empty" key={i} aria-hidden="true" />;
              }
              return (
                <Link
                  className="pad pad--lit"
                  to={`/evenements/${featured.slug}`}
                  key={cat.id}
                >
                  <span className="pad__index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="pad__label">{cat.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 'clamp(2.5rem, 6vw, 4rem)' }}>
        <div className="spread" style={{ marginBottom: '1.25rem' }}>
          <h2>Événements</h2>
          {events && <span className="silkscreen">{events.length} au calendrier</span>}
        </div>

        {error && <p className="notice">{error}</p>}
        {!events && !error && <p className="silkscreen">Chargement…</p>}
        {events?.length === 0 && (
          <p className="empty">Aucun événement publié pour l'instant. Revenez bientôt.</p>
        )}

        {events?.map((ev) => {
          const s = STATUS[ev.status];
          return (
            <Link className="rail" to={`/evenements/${ev.slug}`} key={ev.id}>
              <span className="rail__year">{ev.year}</span>
              <span>
                <h3 className="rail__title">{ev.name}</h3>
                <span className="rail__meta">
                  <span className={`tag ${s.cls}`}>{s.label}</span>
                  {ev.categories.map((c) => (
                    <span className="tag" key={c.id}>{c.name}</span>
                  ))}
                </span>
              </span>
              <span className="rail__aside">
                <span className="readout">
                  <span className="readout__value">{ev._count.predictions}</span>
                  <span className="readout__unit">pronos</span>
                </span>
                <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
                  {ev.location ?? 'Lieu à confirmer'}
                </p>
              </span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
