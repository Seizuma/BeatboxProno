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

export default function Home() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const { user } = useSession();
  const { t, number } = useI18n();

  useEffect(() => {
    api.get('/events').then(({ events }) => setEvents(events)).catch((e) => setError(e.message));
  }, []);

  // L'événement mis en avant : le premier ouvert, sinon le plus récent.
  const featured =
    events?.find((e) => ['OPEN', 'LIVE'].includes(e.status)) ?? events?.[0] ?? null;
  const total = events?.reduce((n, e) => n + e._count.predictions, 0) ?? 0;
  const featuredLabel = featured ? `${featured.name} ${featured.year}` : '';

  return (
    <>
      {['echec', 'failed'].includes(params.get('auth')) && (
        <p className="notice" style={{ marginTop: '1.5rem' }}>{t('home.auth.failed')}</p>
      )}

      <section className="hero">
        <div>
          <p className="silkscreen">{t('home.eyebrow')}</p>
          <h1 className="hero__title">
            {t('home.title.l1')}
            <br />
            {t('home.title.l2a')}
            <em>{t('home.title.em')}</em>
            {t('home.title.l2b')}
          </h1>
          <p className="hero__lede">{t('home.lede')}</p>
          <div className="row" style={{ marginTop: '1.75rem', gap: '1rem' }}>
            {user ? (
              featured && (
                <Link className="btn btn--primary" to={`/events/${featured.slug}`}>
                  {t('home.cta.predict', { event: featuredLabel })}
                </Link>
              )
            ) : (
              <DiscordButton />
            )}
            {total > 0 && (
              <span className="readout">
                <span className="readout__value">{number(total)}</span>
                <span className="readout__unit">{t('home.counter')}</span>
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="silkscreen" style={{ marginBottom: '0.6rem' }}>
            {featured ? t('home.categories', { event: featuredLabel }) : t('home.categories.empty')}
          </p>
          <div className="pads">
            {Array.from({ length: 6 }, (_, i) => {
              const cat = featured?.categories[i];
              if (!cat) {
                return <span className="pad pad--empty" key={i} aria-hidden="true" />;
              }
              return (
                <Link className="pad pad--lit" to={`/events/${featured.slug}`} key={cat.id}>
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
          <h2>{t('home.events')}</h2>
          {events && <span className="silkscreen">{t('home.events.count', { n: events.length })}</span>}
        </div>

        {error && <p className="notice">{error}</p>}
        {!events && !error && <p className="silkscreen">{t('common.loading')}</p>}
        {events?.length === 0 && <p className="empty">{t('home.events.empty')}</p>}

        {events?.map((ev) => (
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
    </>
  );
}
