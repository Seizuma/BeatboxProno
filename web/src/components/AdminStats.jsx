import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * L'onglet « Statistiques ».
 *
 * ─── L'ordre des sections, qui n'est pas décoratif ──────────────────────────
 *
 * On descend du plus décisif au plus accessoire, et chaque section répond à une
 * question qu'on se pose réellement en pilotant le site :
 *
 *   1. Combien de personnes JOUENT — pas combien se sont inscrites.
 *   2. Est-ce que la dernière compète a fait mieux que la précédente.
 *   3. Est-ce que les nouveaux venus reviennent.
 *   4. Est-ce que le barème départage.
 *   5. Est-ce que la boutique est calibrée.
 *   6. Est-ce que quelque chose est cassé sans que personne le sache.
 *
 * ─── Ce qui a été délibérément écarté ───────────────────────────────────────
 *
 * Les vues de profil : c'est de la vanité, et c'est la table la plus sensible
 * du schéma. Les compteurs de badges : `GOLD` vaut « top 5 % », le compte ne
 * dit rien que le nombre de participants ne dise déjà. Tout ce que
 * `consensus.js` envoie déjà sur Discord : deux vérités finissent par diverger,
 * et c'est celle de l'écran qu'on croirait.
 */

const RANGES = [
    [30, '30 jours'],
    [90, '3 mois'],
    [180, '6 mois'],
];

export default function AdminStats() {
    const [stats, setStats] = useState(null);
    const [events, setEvents] = useState(null);
    const [days, setDays] = useState(30);
    const [activity, setActivity] = useState(null);
    const [retention, setRetention] = useState(null);

    // L'événement ouvert en détail. La moitié de ces chiffres n'ont de sens que
    // rapportés à une compète ; les empiler en global les rendrait illisibles.
    const [openEvent, setOpenEvent] = useState(null);
    const [detail, setDetail] = useState(null);

    useEffect(() => {
        api.get('/admin/stats').then(({ stats }) => setStats(stats)).catch(() => { });
        api.get('/admin/stats/events').then(({ events }) => setEvents(events)).catch(() => { });
        api.get('/admin/stats/retention?days=180').then(setRetention).catch(() => { });
    }, []);

    useEffect(() => {
        setActivity(null);
        api.get(`/admin/users/activity?days=${days}`).then(setActivity).catch(() => { });
    }, [days]);

    useEffect(() => {
        if (!openEvent) { setDetail(null); return; }
        setDetail(null);
        api.get(`/admin/stats/events/${openEvent}`).then(setDetail).catch(() => { });
    }, [openEvent]);

    const signups = activity ? activity.days.reduce((n, d) => n + d.signups, 0) : null;
    const today = activity ? activity.days.at(-1)?.active ?? 0 : null;
    const peak = activity ? Math.max(...activity.days.map((d) => d.active), 0) : null;

    return (
        <div className="stack" style={{ gap: '1.6rem' }}>

            {/* ================= 1. Qui joue ================= */}
            <section className="stack" style={{ gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Qui joue</h2>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Figure value={stats?.users ?? '—'} label="Comptes" />
                    <Figure value={stats?.players ?? '—'} label="Ont déposé un prono" accent />
                    <Figure
                        value={stats ? `${pct(stats.players, stats.users)} %` : '—'}
                        label="Taux de conversion"
                    />
                    <Figure
                        value={stats ? stats.touched - stats.players : '—'}
                        label="Ont essayé sans déposer"
                        warn={Boolean(stats && stats.touched - stats.players > stats.players * 0.3)}
                    />
                </div>

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    {stats
                        ? `${stats.submitted} pronostics déposés par ${stats.players} personnes, ` +
                        `soit ${stats.players ? (stats.submitted / stats.players).toFixed(1) : '0'} chacune en moyenne. ` +
                        `${stats.predictions - stats.submitted} brouillons en cours.`
                        : 'Chargement…'}
                </p>

                {stats && stats.touched - stats.players > 0 && (
                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Les {stats.touched - stats.players} comptes qui ont commencé un pronostic sans
                        jamais le déposer sont un signal d'interface, pas une statistique : ils ont composé
                        un tableau puis se sont arrêtés au moment de valider.
                    </p>
                )}
            </section>

            {/* ================= 2. Participation par compète ================= */}
            <section className="stack" style={{ gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Participation par événement</h2>

                {!events ? (
                    <p className="faint">Chargement…</p>
                ) : events.length === 0 ? (
                    <p className="empty">Aucun événement.</p>
                ) : (
                    <div className="panel panel--flush">
                        <table>
                            <thead>
                                <tr>
                                    <th>Événement</th>
                                    <th className="num">Joueurs</th>
                                    <th className="num">Déposés</th>
                                    <th className="num">Brouillons</th>
                                    <th className="num">Moy.</th>
                                    <th className="num">Max</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((e) => (
                                    <tr key={e.id}>
                                        <td>
                                            {e.name} {e.year}
                                            {e.status === 'DRAFT' && (
                                                <span className="tag" style={{ marginLeft: '0.4rem' }}>brouillon</span>
                                            )}
                                        </td>
                                        {/* Le nombre de PERSONNES corrige celui des pronostics,
                                            qu'un joueur remplissant cinq catégories gonfle à lui
                                            seul. C'est la colonne qui compte. */}
                                        <td className="num" style={{ color: 'var(--accent)' }}>{e.players}</td>
                                        <td className="num">{e.submitted}</td>
                                        <td className="num faint">{e.drafts}</td>
                                        <td className="num">{e.avgPoints ?? '—'}</td>
                                        <td className="num">{e.maxPoints ?? '—'}</td>
                                        <td className="num">
                                            <button
                                                className="btn btn--small btn--ghost"
                                                aria-expanded={openEvent === e.id}
                                                onClick={() => setOpenEvent(openEvent === e.id ? null : e.id)}
                                            >
                                                {openEvent === e.id ? 'Réduire' : 'Détail'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {openEvent && <EventDetail detail={detail} />}
            </section>

            {/* ================= 3. Rétention ================= */}
            <section className="panel stack" style={{ gap: '0.7rem' }}>
                <h2 style={{ margin: 0 }}>Reviennent-ils ?</h2>

                {!retention ? (
                    <p className="faint">Chargement…</p>
                ) : retention.cohorts.length === 0 ? (
                    <p className="empty">Pas encore assez d'inscriptions pour former une cohorte.</p>
                ) : (
                    <div className="panel panel--flush">
                        <table>
                            <thead>
                                <tr>
                                    <th>Semaine d'arrivée</th>
                                    <th className="num">Arrivées</th>
                                    <th className="num">J+1</th>
                                    <th className="num">J+7</th>
                                    <th className="num">J+30</th>
                                </tr>
                            </thead>
                            <tbody>
                                {retention.cohorts.map((c) => (
                                    <tr key={c.week}>
                                        <td className="data">{c.week}</td>
                                        <td className="num">{c.signups}</td>
                                        <Rate value={c.d1} />
                                        <Rate value={c.d7} />
                                        <Rate value={c.d30} />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Le pourcentage de chaque cohorte revenue au moins une fois dans la fenêtre, le jour de
                    l'inscription exclu. Un tiret signifie que la cohorte est trop récente pour la
                    question : demander « revenus dans les trente jours ? » à des gens arrivés avant-hier
                    n'a pas de sens.
                </p>
            </section>

            {/* ================= 4. Fréquentation ================= */}
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
                    <Figure value={peak ?? '—'} label={`Pic sur ${days} j`} />
                </div>

                {!activity ? <p className="faint">Chargement…</p> : <ActivityChart days={activity.days} />}

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Les barres comptent les comptes créés dans la journée ; la ligne, les personnes qui se
                    sont manifestées ce jour-là. Le tableau au-dessus répond exactement à ce que ces deux
                    courbes ne font que suggérer.
                </p>
            </section>

            {/* ================= 5. Économie ================= */}
            <section className="stack" style={{ gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Points et boutique</h2>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Figure value={stats?.wallet.earned ?? '—'} label="Points distribués" />
                    <Figure value={stats?.wallet.spent ?? '—'} label="Points dépensés" accent />
                    <Figure value={stats?.wallet.circulating ?? '—'} label="En circulation" />
                    <Figure value={stats?.wallet.purchases ?? '—'} label="Achats" />
                </div>

                {stats && (
                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        {stats.wallet.earned > 0 &&
                            `${pct(stats.wallet.spent, stats.wallet.earned + Math.max(0, stats.wallet.granted))} % de ce qui a été distribué a été dépensé. `}
                        Un rapport très bas veut dire que la boutique est trop chère ou trop pauvre ; très
                        haut, que les cosmétiques partent plus vite qu'on ne les fabrique.
                        {stats.wallet.granted !== 0 && ` ${stats.wallet.granted} point(s) accordés à la main.`}
                    </p>
                )}

                {stats && stats.topItems.length > 0 && (
                    <div className="panel panel--flush">
                        <table>
                            <thead>
                                <tr><th>Article</th><th className="num">Achats</th><th className="num">Points</th></tr>
                            </thead>
                            <tbody>
                                {stats.topItems.map((i) => (
                                    <tr key={i.itemId}>
                                        <td className="data">{i.itemId}</td>
                                        <td className="num">{i.n}</td>
                                        <td className="num faint">{i.revenue}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ================= 6. Vie sociale ================= */}
            <section className="stack" style={{ gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Groupes</h2>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    {/* Un groupe à un seul membre n'est pas un groupe : c'est quelqu'un
                        qui a cliqué sur « créer » sans inviter personne. Les compter
                        ensemble surestimerait la vie sociale du site. */}
                    <Figure value={stats?.groupsShared ?? '—'} label="Groupes actifs" accent />
                    <Figure value={stats ? stats.groups - stats.groupsShared : '—'} label="Groupes solitaires" />
                    <Figure value={stats?.grouped ?? '—'} label="Joueurs en groupe" />
                    <Figure value={stats?.comments ?? '—'} label="Commentaires" />
                </div>
                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Sur un site de pronostics, l'appartenance à un groupe est le premier moteur de retour :
                    on revient parce que des amis regardent. À rapprocher du tableau de rétention.
                </p>
            </section>

            {/* ================= 7. Santé ================= */}
            <section className="stack" style={{ gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Santé du site</h2>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    {/* Ce n'est pas une statistique mais une ALARME : si le webhook
                        Discord tombe, les suggestions et les rapports de bug s'empilent
                        en silence et personne ne le sait avant trois semaines. */}
                    <Figure value={stats?.postboxFailed ?? '—'} label="Courriers en échec" warn={Boolean(stats?.postboxFailed)} />
                    <Figure value={stats?.postboxPending ?? '—'} label="Courriers en attente" warn={Boolean(stats?.postboxPending)} />
                    <Figure value={stats?.orphans ?? '—'} label="Participants sans artiste" warn={Boolean(stats?.orphans)} />
                    <Figure value={stats?.noPhoto ?? '—'} label="Artistes sans photo" />
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Figure value={stats?.noKind ?? '—'} label="Artistes sans format" warn={Boolean(stats?.noKind)} />
                    <Figure value={stats?.artists ?? '—'} label="Artistes au référentiel" />
                    <Figure value={stats?.banned ?? '—'} label="Comptes bannis" />
                    <Figure value={stats?.exclusions ?? '—'} label="Exclusions d'événement" />
                </div>

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Un artiste sans format n'est proposé nulle part : il est invisible à la pioche d'une
                    sélection comme à la composition d'un tableau. Un participant sans artiste est un
                    fantôme dans les arbres de battles. Les deux se règlent avant l'ouverture d'une
                    compète, pas pendant.
                </p>
            </section>
        </div>
    );
}

/**
 * Le détail d'une compète : par catégorie, puis la dispersion des scores.
 *
 * La vue par catégorie est celle qui décide du travail de préparation : si le
 * Crew rassemble douze pronostics quand le Solo en fait deux cents, c'est du
 * seeding qu'on peut arrêter — ou une catégorie à mettre en avant autrement.
 */
function EventDetail({ detail }) {
    if (!detail) return <p className="faint">Chargement du détail…</p>;

    const { categories, scores } = detail;

    return (
        <div className="panel stack" style={{ gap: '0.8rem', borderColor: 'var(--accent)' }}>
            <h3 style={{ margin: 0 }}>{detail.event.name} {detail.event.year}</h3>

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr>
                            <th>Catégorie</th>
                            <th className="num">Joueurs</th>
                            <th className="num">Déposés</th>
                            <th className="num">Brouillons</th>
                            <th className="num">Moy.</th>
                            <th className="num">Max</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((c) => (
                            <tr key={c.id}>
                                <td>
                                    {c.name}{' '}
                                    <span className="faint data" style={{ fontSize: '0.75rem' }}>{c.kind}</span>
                                </td>
                                <td className="num" style={{ color: 'var(--accent)' }}>{c.players}</td>
                                <td className="num">{c.submitted}</td>
                                <td className="num faint">{c.drafts}</td>
                                <td className="num">{c.avgPoints ?? '—'}</td>
                                <td className="num">{c.maxPoints ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {scores.n === 0 ? (
                <p className="faint" style={{ margin: 0 }}>
                    Aucun pronostic scoré : la dispersion n'est calculable qu'après publication des
                    résultats.
                </p>
            ) : (
                <>
                    <div className="row" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>
                        <Readout value={scores.min} label="minimum" />
                        <Readout value={scores.median} label="médiane" />
                        <Readout value={scores.mean} label="moyenne" />
                        <Readout value={scores.max} label="maximum" />
                        <Readout value={scores.spread} label="écart-type" />
                    </div>

                    <Histogram bins={scores.histogram} />

                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        {scores.spread !== null
                            && scores.max - scores.min > 0
                            && scores.spread / (scores.max - scores.min) < 0.12
                            ? "L'écart-type est très faible au regard de l'amplitude : le barème départage mal, et le classement tient largement au hasard des égalités."
                            : "L'écart-type dit si le barème départage. Écrasé, le classement est du bruit — c'est la mesure à surveiller quand on retouche scoring.js."}
                    </p>
                </>
            )}
        </div>
    );
}

/**
 * La distribution des scores.
 *
 * Un histogramme et non une courbe : on cherche une FORME — un pic unique, deux
 * bosses, une traîne — et douze barres la donnent d'un coup d'œil là où une
 * ligne lissée inventerait des valeurs entre les paliers.
 */
function Histogram({ bins }) {
    if (!bins || bins.length === 0) return null;

    const W = 720;
    const H = 140;
    const PAD = { top: 10, bottom: 22, side: 8 };
    const innerW = W - PAD.side * 2;
    const innerH = H - PAD.top - PAD.bottom;
    const max = Math.max(...bins.map((b) => b.n), 1);
    const step = innerW / bins.length;

    return (
        <figure style={{ margin: 0 }}>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                role="img"
                aria-label="Distribution des scores déposés"
            >
                <line
                    x1={PAD.side} y1={PAD.top + innerH} x2={W - PAD.side} y2={PAD.top + innerH}
                    stroke="var(--line)" strokeWidth="1"
                />
                {bins.map((b, i) => {
                    const h = (b.n / max) * innerH;
                    return (
                        <g key={`${b.from}-${i}`}>
                            <rect
                                x={PAD.side + i * step + step * 0.15}
                                y={PAD.top + innerH - h}
                                width={step * 0.7}
                                height={h}
                                fill="var(--c)"
                            >
                                <title>{`${b.from} à ${b.to} points · ${b.n} pronostic(s)`}</title>
                            </rect>
                            {i % 2 === 0 && (
                                <text
                                    x={PAD.side + i * step + step / 2}
                                    y={H - 6}
                                    textAnchor="middle"
                                    fill="var(--ink-faint)"
                                    style={{ fontFamily: 'var(--font-data)', fontSize: '11px' }}
                                >
                                    {b.from}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </figure>
    );
}

/** Une cellule de taux, grisée quand la cohorte est trop jeune pour répondre. */
function Rate({ value }) {
    if (value === null) return <td className="num faint">—</td>;
    return (
        <td
            className="num"
            style={value >= 40 ? { color: 'var(--g)' } : value < 15 ? { color: 'var(--m)' } : undefined}
        >
            {value} %
        </td>
    );
}

function Readout({ value, label }) {
    return (
        <span className="readout">
            <span className="readout__value">{value ?? '—'}</span>
            <span className="readout__unit">{label}</span>
        </span>
    );
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

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

function Figure({ value, label, accent, warn }) {
    return (
        <div className="panel">
            <p
                className="display"
                style={{
                    fontSize: 'calc(2.2rem * var(--display-scale))',
                    color: warn ? 'var(--m)' : accent ? 'var(--accent)' : 'inherit',
                    margin: 0,
                }}
            >
                {value}
            </p>
            <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{label}</p>
        </div>
    );
}