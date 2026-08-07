import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import DiscordButton from '../components/DiscordButton.jsx';

const STATUS_CLASS = {
  DRAFT: '',
  OPEN: 'tag--live',
  LIVE: 'tag--live',
  FINISHED: 'tag--done',
};

/**
 * La page « Événements ». Ce qu'on vient y chercher, c'est où pronostiquer :
 * les événements ouverts passent donc avant tout le reste, et l'accroche se
 * réduit à un bandeau. Les catégories ne sont plus listées ici — elles
 * appartiennent à la page de l'événement, pas à son annonce.
 */
export default function Home() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const { user } = useSession();
  const { t, number } = useI18n();

  useEffect(() => {
    api.get('/events').then(({ events }) => setEvents(events)).catch((e) => setError(e.message));
  }, []);

  const open = events?.filter((e) => ['OPEN', 'LIVE'].includes(e.status)) ?? [];
  const rest = events?.filter((e) => !['OPEN', 'LIVE'].includes(e.status)) ?? [];
  const total = events?.reduce((n, e) => n + e._count.predictions, 0) ?? 0;

  return (
    <>
      {['echec', 'failed'].includes(params.get('auth')) && (
        <p className="notice" style={{ marginTop: '1.5rem' }}>{t('home.auth.failed')}</p>
      )}

      <section className="hero">
        <p className="silkscreen">{t('home.eyebrow')}</p>
        <div className="hero__band">
          <h1 className="hero__title">
            {t('home.title.l1')}
            <br />
            {t('home.title.l2a')}
            <em>{t('home.title.em')}</em>
            {t('home.title.l2b')}
          </h1>
          <div className="stack" style={{ gap: '0.9rem' }}>
            <p className="hero__lede">{t('home.lede')}</p>
            <div className="row" style={{ gap: '1rem' }}>
              {!user && <DiscordButton />}
              {total > 0 && (
                <span className="readout">
                  <span className="readout__value">{number(total)}</span>
                  <span className="readout__unit">{t('home.counter')}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="notice">{error}</p>}
      {!events && !error && <p className="silkscreen">{t('common.loading')}</p>}

      {/* Ce sur quoi on peut parier maintenant. */}
      {events && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="spread" style={{ marginBottom: '0.9rem' }}>
            <h2>{t('home.open')}</h2>
            {open.length > 0 && <span className="silkscreen">{open.length}</span>}
          </div>

          {open.length === 0 ? (
            <div className="empty">
              <p style={{ margin: 0, color: 'var(--ink)' }}>{t('home.open.none')}</p>
              <p style={{ margin: '0.3rem 0 0' }}>{t('home.open.none.lede')}</p>
            </div>
          ) : (
            open.map((ev) => (
              <Link className="rail rail--open" to={`/events/${ev.slug}`} key={ev.id}>
                <span className="rail__year">{ev.year}</span>
                <span>
                  <h3 className="rail__title">{ev.name}</h3>
                  <span className="rail__meta">
                    <span className={`tag ${STATUS_CLASS[ev.status] ?? ''}`}>{t(`status.${ev.status}`)}</span>
                    {ev.categories.map((c) => (
                      <span className="tag" key={c.id}>{c.name}</span>
                    ))}
                  </span>
                </span>
                <span className="rail__aside">
                  <span className="btn btn--primary btn--small">
                    {t('home.cta.predict', { event: `${ev.name} ${ev.year}` })}
                  </span>
                  <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
                    {ev.location ?? t('home.venue.tbc')} · {ev._count.predictions} {t('home.predictions.short')}
                  </p>
                </span>
              </Link>
            ))
          )}
        </section>
      )}

      {/* Le reste du calendrier : archives et à-venir. */}
      {rest.length > 0 && (
        <section>
          <div className="spread" style={{ marginBottom: '0.9rem' }}>
            <h2>{t('home.events')}</h2>
            <span className="silkscreen">{t('home.events.count', { n: rest.length })}</span>
          </div>

          {rest.map((ev) => (
            <Link className="rail" to={`/events/${ev.slug}`} key={ev.id}>
              <span className="rail__year">{ev.year}</span>
              <span>
                <h3 className="rail__title">{ev.name}</h3>
                <span className="rail__meta">
                  <span className={`tag ${STATUS_CLASS[ev.status] ?? ''}`}>{t(`status.${ev.status}`)}</span>
                  {ev.categories.map((c) => (
                    <span className="tag" key={c.id}>{c.name}</span>
                  ))}
                </span>
              </span>
              <span className="rail__aside">
                <span className="readout">
                  <span className="readout__value">{ev._count.predictions}</span>
                  <span className="readout__unit">{t('home.predictions.short')}</span>
                </span>
                <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
                  {ev.location ?? t('home.venue.tbc')}
                </p>
              </span>
            </Link>
          ))}
        </section>
      )}

      {events?.length === 0 && <p className="empty">{t('home.events.empty')}</p>}
    </>
  );
}