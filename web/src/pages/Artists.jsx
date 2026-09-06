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
  const { t, number } = useI18n();

  // Pas de session requise ici : une fiche d'artiste ne parle de personne
  // d'inscrit, et c'est le genre de page qu'on partage. Seul le COMPTEUR
  // distingue — il ne retient que les visiteurs connectés.
  useEffect(() => {
    api.get(`/artists/${slug}`).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

  const { artist, totals, appearances } = data;

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

      {/* Le seul chiffre qui se cumule honnêtement d'une compétition à
          l'autre. Tout le reste dépend du plateau, de la coupe et de l'année :
          agrégé, ça ne décrit aucune des situations réelles. */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Metric value={number(totals?.pointsFrom ?? 0)} label={t('artists.pointsFrom')} accent />
        {/* Une vue par visiteur et par jour : le chiffre dit combien de membres
            sont venus, pas combien de fois la page a été chargée. */}
        {data.views != null && <Metric value={number(data.views)} label={t('artists.views')} />}
      </div>

      <section className="stack">
        <h2>{t('artists.appearances')}</h2>
        {appearances.length === 0 ? (
          <p className="empty">{t('artists.appearances.empty')}</p>
        ) : (
          <div className="stack" style={{ gap: '1.2rem' }}>
            {appearances.map((a) => (
              <Appearance key={a.contenderId} a={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Une participation, avec ce que la foule en a dit.
 *
 * Un bloc par compétition, et c'est tout l'objet de cette refonte : « donné
 * qualifié par 31 % » sur quelqu'un entré 20e à Varsovie et 1er à Beatland ne
 * décrit aucune des deux situations. La moyenne de deux vérités contradictoires
 * n'est pas une vérité.
 */
function Appearance({ a }) {
  const { t, number } = useI18n();
  const c = a.crowd;

  /**
   * Une carte n'apparaît que si la catégorie peut produire ce chiffre.
   *
   * Sans phase de classement — une Loopstation en tableau direct — personne n'a
   * jamais placé cet artiste dans une liste : « donné qualifié par » et « rang
   * moyen donné » n'ont rien derrière eux. Un tiret à leur place n'est pas une
   * information, c'est une case qu'on remplit parce qu'elle existe.
   *
   * La décision se prend sur la STRUCTURE de la compétition, pas sur le nombre
   * de votes : une catégorie avec éliminations où personne n'a encore
   * pronostiqué doit afficher « 0 % », pas escamoter la carte comme si la
   * question ne se posait pas.
   */
  const has = a.has ?? { ranking: true, cut: true, bracket: true };
  const cards = [
    has.bracket && { value: c.pickedToWin, label: t('artists.pickedToWin') },
    has.cut && {
      value: c.qualifiedShare == null ? '—' : `${c.qualifiedShare} %`,
      label: t('artists.qualifiedShareCut', { n: c.cut }),
    },
    has.ranking && { value: c.averageRank ?? '—', label: t('artists.averageRank') },
    // La fiabilité ne se pose qu'une fois des battles disputées : avant, elle
    // n'a pas de dénominateur.
    c.judged > 0 && { value: `${c.accuracy} %`, label: t('artists.accuracy') },
  ].filter(Boolean);

  return (
    <article className="panel stack" style={{ gap: '0.8rem' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>
            <Link to={`/events/${a.eventSlug}`}>{a.event} {a.year}</Link>
          </h3>
          <p className="eyebrow" style={{ margin: '0.25rem 0 0' }}>
            {a.category}
            {a.seed != null && ` · ${t('common.seed')} ${a.seed}`}
          </p>
        </div>
        {a.points > 0 && (
          <span className="readout">
            <span className="readout__value">{number(a.points)}</span>
            <span className="readout__unit">{t('common.points')}</span>
          </span>
        )}
      </header>

      {c.voters === 0 && c.pickedToWin === 0 ? (
        <p className="faint" style={{ margin: 0 }}>{t('artists.noData')}</p>
      ) : (
        <>
          {cards.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem' }}>
              {cards.map((card) => (
                <Small key={card.label} value={card.value} label={card.label} />
              ))}
            </div>
          )}

          {c.distribution.length > 0 && (
            <div>
              <p className="eyebrow" style={{ margin: '0 0 0.4rem' }}>
                {t('artists.spread')}
                <span className="faint"> · {t('artists.voters', { n: c.voters })}</span>
              </p>
              <RankSpread distribution={c.distribution} cut={c.cut} />
              {c.bestRank != null && (
                <p className="faint data" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
                  {t('artists.bestWorst', { best: c.bestRank, worst: c.worstRank })}
                </p>
              )}
            </div>
          )}

          {c.byRound.length > 0 && (
            <div>
              <p className="eyebrow" style={{ margin: '0 0 0.4rem' }}>{t('artists.byRound')}</p>
              <RoundBars rounds={c.byRound} />
            </div>
          )}
        </>
      )}
    </article>
  );
}

/**
 * La distribution des places données.
 *
 * C'est le graphique qui compte. « Rang moyen 10,3 » ne dit pas si tout le
 * monde le voit dixième, ou si la moitié le voit premier et l'autre vingtième —
 * deux situations opposées derrière le même nombre. La barre le montre sans
 * qu'on ait à l'expliquer.
 *
 * Tracé en SVG à la main plutôt qu'avec une bibliothèque : celles qui existent
 * apportent leurs polices, leurs coins arrondis et leurs dégradés, qu'il
 * faudrait ensuite désapprendre un par un pour retrouver l'écran télétexte.
 */
function RankSpread({ distribution, cut }) {
  const W = 640;
  const H = 90;
  const PAD = 16;

  const maxRank = Math.max(...distribution.map((d) => d.rank));
  const maxN = Math.max(...distribution.map((d) => d.n));
  const innerW = W - PAD * 2;
  const innerH = H - PAD - 18;
  const step = innerW / maxRank;
  const barW = Math.max(2, step * 0.7);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Distribution des places données"
    >
      <line x1={PAD} y1={PAD + innerH} x2={W - PAD} y2={PAD + innerH} stroke="var(--line)" strokeWidth="1" />

      {distribution.map((d) => {
        const x = PAD + (d.rank - 0.5) * step;
        const h = (d.n / maxN) * innerH;
        // Vert dans la coupe, gris dehors : la même convention que partout
        // ailleurs sur le site pour dire « qualifié ».
        const inCut = cut ? d.rank <= cut : false;
        return (
          <rect
            key={d.rank}
            x={x - barW / 2}
            y={PAD + innerH - h}
            width={barW}
            height={h}
            fill={inCut ? 'var(--ok)' : 'var(--ink-faint)'}
          >
            <title>{`${d.rank}e — ${d.n} pronostic(s)`}</title>
          </rect>
        );
      })}

      {/* Le trait de coupe, s'il y en a une : c'est lui qui donne son sens au
          reste du graphique. */}
      {cut && cut < maxRank && (
        <line
          x1={PAD + cut * step}
          y1={PAD - 4}
          x2={PAD + cut * step}
          y2={PAD + innerH}
          stroke="var(--y)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      )}

      {[1, Math.ceil(maxRank / 2), maxRank].map((r) => (
        <text
          key={r}
          x={PAD + (r - 0.5) * step}
          y={H - 4}
          textAnchor="middle"
          fill="var(--ink-faint)"
          style={{ fontFamily: 'var(--font-data)', fontSize: '11px' }}
        >
          {r}
        </text>
      ))}
    </svg>
  );
}

/** Les tours où on le donne vainqueur, en barres horizontales. */
function RoundBars({ rounds }) {
  const { t } = useI18n();
  const max = Math.max(...rounds.map((r) => r.n));

  return (
    <div className="stack" style={{ gap: '0.3rem' }}>
      {rounds.map((r) => (
        <div key={r.round} className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <span className="data faint" style={{ fontSize: '0.75rem', width: '9rem', flex: 'none' }}>
            {t(`bracket.round.${r.round}`)}
          </span>
          <span className="meter" style={{ flex: 1 }}>
            <span style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="data" style={{ fontSize: '0.78rem', width: '2.5rem', textAlign: 'right' }}>
            {r.n}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Un chiffre de participation : plus petit que les cartes du haut. */
function Small({ value, label }) {
  return (
    <div style={{ border: '1px solid var(--line)', padding: '0.5rem 0.6rem' }}>
      <p className="display" style={{ fontSize: 'calc(1.5rem * var(--display-scale))', margin: 0 }}>
        {value}
      </p>
      <p className="eyebrow" style={{ margin: '0.25rem 0 0', fontSize: '0.7rem' }}>{label}</p>
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