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
              <p className="faint data" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem' }}>
                {c.bestRank != null && (
                  <>{t('artists.bestWorst', { best: c.bestRank, worst: c.worstRank })} · </>
                )}
                {t('artists.spread.hint')}
              </p>
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
  const { t } = useI18n();

  /**
   * Le rang sous le curseur, ou `null` quand on ne pointe rien.
   *
   * ─── Ce que l'infobulle native coûtait ────────────────────────────────────
   *
   * Le graphique portait un `<title>` par barre. C'est gratuit à écrire et
   * mauvais à utiliser : le navigateur attend près d'une seconde avant de
   * l'afficher, la place où bon lui semble, l'écrit dans SA police — et surtout
   * ne la déclenche jamais au toucher. Sur téléphone, la moitié de
   * l'information du graphique était inaccessible.
   *
   * Il fallait en plus viser la barre elle-même : pour un rang à deux
   * pronostics, c'est un rectangle de quatre pixels sur trois.
   */
  const [active, setActive] = useState(null);

  const W = 640;
  /**
   * Une bande réservée EN HAUT du tracé pour la lecture.
   *
   * La valeur se lisait sous le graphique, ce qui obligeait l'œil à sortir de
   * l'image pour savoir ce qu'il regardait. La poser par-dessus les barres
   * réglerait ça mais la rendrait illisible dès qu'une barre monte haut —
   * c'est-à-dire précisément là où l'on regarde.
   *
   * Une bande qui lui appartient résout les deux : la lecture est DANS le
   * graphique, et rien ne peut venir dessous.
   */
  const READ = 20;
  const H = 108;
  const PAD = 16;

  const maxRank = Math.max(...distribution.map((d) => d.rank));
  const maxN = Math.max(...distribution.map((d) => d.n));
  const innerW = W - PAD * 2;
  const top = READ + 6;
  const innerH = H - top - 18;
  const step = innerW / maxRank;
  const barW = Math.max(2, step * 0.7);

  const byRank = new Map(distribution.map((d) => [d.rank, d.n]));

  /**
   * Le rang le plus souvent donné, montré quand on ne pointe rien.
   *
   * Un graphique qui n'affiche sa légende qu'au survol demande d'agir avant de
   * comprendre. Celui-ci dit d'emblée ce qu'il a de plus intéressant à dire, et
   * le survol ne fait qu'explorer autour.
   */
  const mode = distribution.reduce((best, d) => (d.n > (best?.n ?? 0) ? d : best), null);
  const shown = active != null ? { rank: active, n: byRank.get(active) ?? 0 } : mode;

  /** Le rang sous une abscisse, dans le repère du viewBox. */
  const rankAt = (clientX, target) => {
    const box = target.getBoundingClientRect();
    if (box.width === 0) return null;
    const x = ((clientX - box.left) / box.width) * W;
    const rank = Math.ceil((x - PAD) / step);
    return Math.min(maxRank, Math.max(1, rank));
  };

  const move = (e) => setActive(rankAt(e.clientX, e.currentTarget));

  const key = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const from = active ?? mode?.rank ?? 1;
    const next =
      e.key === 'Home' ? 1
        : e.key === 'End' ? maxRank
          : e.key === 'ArrowLeft' ? from - 1
            : from + 1;
    setActive(Math.min(maxRank, Math.max(1, next)));
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        role="img"
        aria-label={t('artists.spread.aria')}
        /* `pointer` et non `mouse` : le même gestionnaire couvre la souris, le
           stylet ET le doigt. `touchAction: pan-y` laisse le défilement
           vertical passer, sinon on ne peut plus faire défiler la page depuis
           le graphique. */
        tabIndex={0}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setActive(null)}
        onKeyDown={key}
        onBlur={() => setActive(null)}
      >
        <line x1={PAD} y1={top + innerH} x2={W - PAD} y2={top + innerH} stroke="var(--line)" strokeWidth="1" />

        {/* La colonne de lecture : toute la hauteur du tracé, pas seulement la
            barre. C'est ce qui rend le survol utilisable — viser un rectangle
            de quatre pixels sur trois ne l'était pas. */}
        {active != null && (
          <rect
            x={PAD + (active - 1) * step}
            y={top - 6}
            width={step}
            height={innerH + 6}
            fill="var(--surface-2)"
          />
        )}

        {distribution.map((d) => {
          const x = PAD + (d.rank - 0.5) * step;
          const h = (d.n / maxN) * innerH;
          // Vert dans la coupe, gris dehors : la même convention que partout
          // ailleurs sur le site pour dire « qualifié ».
          const inCut = cut ? d.rank <= cut : false;
          const on = d.rank === shown?.rank;
          return (
            <rect
              key={d.rank}
              x={x - barW / 2}
              y={top + innerH - h}
              width={barW}
              height={h}
              fill={on ? 'var(--y)' : inCut ? 'var(--ok)' : 'var(--ink-faint)'}
            />
          );
        })}

        {/* Le trait de coupe, s'il y en a une : c'est lui qui donne son sens au
            reste du graphique. */}
        {cut && cut < maxRank && (
          <line
            x1={PAD + cut * step}
            y1={top - 4}
            x2={PAD + cut * step}
            y2={top + innerH}
            stroke="var(--y)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}

        {/* La lecture SUIT la colonne active, dans sa bande.
            Elle est calée à l'aplomb de ce qu'on regarde, ce qu'un texte fixe
            à gauche ne ferait pas, et l'ancrage bascule près des bords pour
            qu'elle ne sorte jamais du cadre. */}
        {shown && (
          <text
            x={Math.min(W - PAD, Math.max(PAD, PAD + (shown.rank - 0.5) * step))}
            y={READ - 6}
            textAnchor={
              shown.rank <= 2 ? 'start' : shown.rank >= maxRank - 1 ? 'end' : 'middle'
            }
            fill={active != null ? 'var(--y)' : 'var(--ink-faint)'}
            style={{ fontFamily: 'var(--font-data)', fontSize: '12px' }}
          >
            {t(shown.n === 1 ? 'artists.spread.readOne' : 'artists.spread.read', {
              n: shown.n,
              rank: shown.rank,
            })}
            {cut && shown.rank <= cut ? ` · ${t('artists.spread.cut')}` : ''}
          </text>
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

      {/* La même lecture, invisible, pour les lecteurs d'écran : un `<text>`
          dans un SVG marqué `role="img"` n'est pas annoncé, et la navigation
          aux flèches serait muette sans ce relais. */}
      <p className="visually-hidden" aria-live="polite">
        {shown
          ? t(shown.n === 1 ? 'artists.spread.readOne' : 'artists.spread.read', {
            n: shown.n,
            rank: shown.rank,
          })
          : ''}
      </p>

    </div>
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