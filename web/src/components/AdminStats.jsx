import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * L'onglet « Statistiques ».
 *
 * ─── Pourquoi il existe ─────────────────────────────────────────────────────
 *
 * Ces chiffres vivaient en tête de l'onglet « Comptes ». Ils y étaient à
 * l'étroit et mal rangés : la courbe de fréquentation ne parle pas des comptes,
 * elle parle du SITE. On l'ouvrait pour savoir si une annonce avait porté, et
 * on tombait sur une liste de cent personnes à administrer. Deux besoins, deux
 * écrans.
 *
 * Le déplacement libère aussi de la place : un tableau de bord peut grandir,
 * un en-tête d'onglet non. Les compteurs du site s'y ajoutent aujourd'hui, le
 * reste suivra.
 *
 * ─── Ce que l'écran raconte, dans cet ordre ─────────────────────────────────
 *
 * D'abord la taille du site — combien de monde, combien de compètes, combien
 * de pronostics. Puis son mouvement : qui arrive, qui revient. Les deux
 * répondent à des questions différentes et sont séparés pour cette raison.
 */

const RANGES = [
    [30, '30 jours'],
    [90, '3 mois'],
    [180, '6 mois'],
];

export default function AdminStats() {
    const [stats, setStats] = useState(null);
    const [days, setDays] = useState(30);
    const [activity, setActivity] = useState(null);

    useEffect(() => {
        api.get('/admin/stats').then(({ stats }) => setStats(stats)).catch(() => { });
    }, []);

    useEffect(() => {
        setActivity(null);
        api.get(`/admin/users/activity?days=${days}`).then(setActivity).catch(() => { });
    }, [days]);

    const signups = activity ? activity.days.reduce((n, d) => n + d.signups, 0) : null;
    const today = activity ? activity.days.at(-1)?.active ?? 0 : null;
    const peak = activity ? Math.max(...activity.days.map((d) => d.active), 0) : null;

    return (
        <div className="stack">
            {/* --- La taille du site ---------------------------------------------- */}
            <section className="stack" style={{ gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Le site</h2>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Figure value={stats ? stats.users : '—'} label="Comptes" accent />
                    <Figure value={stats ? stats.events : '—'} label="Événements publiés" />
                    <Figure value={stats ? stats.submitted : '—'} label="Pronostics déposés" />
                    <Figure value={stats ? stats.groups : '—'} label="Groupes privés" />
                </div>

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    {stats
                        ? `${stats.predictions} pronostics au total, brouillons compris — ${stats.submitted} sont ` +
                        `réellement déposés. ${stats.artists} artistes au référentiel, ` +
                        `${stats.drafts} événement(s) encore en brouillon.`
                        : 'Chargement…'}
                </p>
            </section>

            {/* --- Le mouvement ---------------------------------------------------- */}
            <section className="panel stack" style={{ gap: '0.7rem' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h2 style={{ margin: 0 }}>Arrivées et fréquentation</h2>
                    <span className="row" style={{ gap: '0.3rem' }}>
                        {RANGES.map(([n, label]) => (
                            <button
                                key={n}
                                className={`btn btn--small${days === n ? ' btn--primary' : ' btn--ghost'}`}
                                onClick={() => setDays(n)}
                            >
                                {label}
                            </button>
                        ))}
                    </span>
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Figure value={signups ?? '—'} label={`Arrivées sur ${days} j`} />
                    <Figure value={today ?? '—'} label="Actifs aujourd'hui" />
                    <Figure value={peak ?? '—'} label={`Pic d'activité sur ${days} j`} />
                </div>

                {!activity ? <p className="faint">Chargement…</p> : <ActivityChart days={activity.days} />}

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Les barres comptent les comptes créés dans la journée ; la ligne, les personnes qui se
                    sont manifestées ce jour-là. Séparées, ces deux séries ne disent pas grand-chose ; côte à
                    côte elles répondent à la question qui suit une annonce — les nouveaux venus sont-ils
                    restés ?
                </p>
            </section>
        </div>
    );
}

/**
 * Deux séries sur une grille de journées : les arrivées en barres, la
 * fréquentation en ligne.
 *
 * Tracé en SVG à la main plutôt qu'avec une bibliothèque de graphiques : celles
 * qui existent apportent leurs propres polices, leurs coins arrondis et leurs
 * dégradés, qu'il faudrait ensuite désapprendre une par une pour retrouver
 * l'écran télétexte. Cent lignes de SVG coûtent moins qu'un mégaoctet de
 * paquet à corriger.
 *
 * Les deux séries ont leur propre échelle. Une échelle commune serait plus
 * honnête en théorie, mais la fréquentation dépasse les arrivées d'un facteur
 * dix ou vingt : les barres seraient invisibles, et l'écran ne montrerait
 * qu'une seule des deux informations.
 */
function ActivityChart({ days }) {
    const W = 720;
    const H = 200;
    const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

    const maxSignups = Math.max(...days.map((d) => d.signups), 1);
    const maxActive = Math.max(...days.map((d) => d.active), 1);

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const step = innerW / days.length;
    const barW = Math.max(1, step * 0.62);

    const y = (value, max) => PAD.top + innerH - (value / max) * innerH;
    const x = (i) => PAD.left + i * step + step / 2;

    const line = days
        .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.active, maxActive).toFixed(1)}`)
        .join(' ');

    // Une étiquette tous les sept jours : au quotidien elles se chevauchent, et
    // sur six mois elles formeraient un pâté noir.
    const everyNth = Math.ceil(days.length / 8);

    return (
        <figure style={{ margin: 0 }}>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                // `width: 100%` avec un viewBox fixe : le graphique se met à l'échelle
                // sans qu'on ait à le redessiner au redimensionnement.
                style={{ width: '100%', height: 'auto', display: 'block' }}
                role="img"
                aria-label="Arrivées et fréquentation par journée"
            >
                {/* La ligne de base, comme le filet d'un tableau télétexte. */}
                <line
                    x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH}
                    stroke="var(--line)" strokeWidth="1"
                />

                {days.map((d, i) => (
                    <rect
                        key={d.day}
                        x={x(i) - barW / 2}
                        y={y(d.signups, maxSignups)}
                        width={barW}
                        height={PAD.top + innerH - y(d.signups, maxSignups)}
                        fill="var(--y)"
                    >
                        <title>{`${d.day} · ${d.signups} arrivée${d.signups > 1 ? 's' : ''}`}</title>
                    </rect>
                ))}

                <path d={line} fill="none" stroke="var(--c)" strokeWidth="2" />

                {days.map((d, i) => (
                    <circle key={d.day} cx={x(i)} cy={y(d.active, maxActive)} r="2" fill="var(--c)">
                        <title>{`${d.day} · ${d.active} actif${d.active > 1 ? 's' : ''}`}</title>
                    </circle>
                ))}

                {days.map((d, i) =>
                    i % everyNth === 0 ? (
                        <text
                            key={d.day}
                            x={x(i)}
                            y={H - 6}
                            textAnchor="middle"
                            fill="var(--ink-faint)"
                            style={{ fontFamily: 'var(--font-data)', fontSize: '11px' }}
                        >
                            {d.day.slice(5)}
                        </text>
                    ) : null
                )}
            </svg>

            <figcaption className="row" style={{ gap: '1rem', marginTop: '0.4rem' }}>
                <span className="faint data" style={{ fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--y)' }}>█</span> arrivées (max {maxSignups}/j)
                </span>
                <span className="faint data" style={{ fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--c)' }}>──</span> actifs (max {maxActive}/j)
                </span>
            </figcaption>
        </figure>
    );
}

function Figure({ value, label, accent }) {
    return (
        <div className="panel">
            <p
                className="display"
                style={{
                    fontSize: 'calc(2.2rem * var(--display-scale))',
                    color: accent ? 'var(--accent)' : 'inherit',
                    margin: 0,
                }}
            >
                {value}
            </p>
            <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{label}</p>
        </div>
    );
}