import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { isOwner } from '../lib/context.jsx';

/**
 * L'onglet « Comptes ».
 *
 * Sorti d'Admin.jsx, où il partageait un fichier de mille sept cents lignes
 * avec la structure des événements, les artistes et les résultats. Il a
 * maintenant sa courbe, son décompte et sa liste repliable ; l'y laisser aurait
 * rendu le fichier illisible pour un panneau qui n'a rien à voir avec les
 * autres.
 *
 * Le principe de l'écran : les chiffres d'abord, la liste ensuite et repliée.
 * Déployée en permanence, elle noyait sous cent lignes la seule information
 * qu'on vient chercher la plupart du temps — combien de monde, et depuis quand.
 */

const RANGES = [
    [30, '30 jours'],
    [90, '3 mois'],
    [180, '6 mois'],
];

export default function AdminPeople({ currentUser, useFlash }) {
    const [flash, run] = useFlash();

    // Le porte-monnaie ouvert, s'il y en a un. Un seul à la fois : c'est un
    // geste qu'on fait pour une personne précise, pas une colonne qu'on
    // parcourt. En faire une colonne aurait demandé un agrégat par ligne sur
    // cent comptes, pour une information qu'on regarde une fois par mois.
    const [wallet, setWallet] = useState(null);

    const [data, setData] = useState(null);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [days, setDays] = useState(30);
    const [activity, setActivity] = useState(null);

    const reload = () =>
        api.get(`/admin/users?q=${encodeURIComponent(q)}`).then(setData);

    useEffect(() => {
        // Le délai évite une requête par lettre tapée. 300 ms : assez court pour
        // qu'on ne le remarque pas, assez long pour couvrir une frappe normale.
        const id = setTimeout(() => { reload().catch(() => { }); }, 300);
        return () => clearTimeout(id);
    }, [q]);

    useEffect(() => {
        api.get(`/admin/users/activity?days=${days}`).then(setActivity).catch(() => { });
    }, [days]);

    // Chercher, c'est vouloir voir : le repli ne doit pas obliger à un second
    // geste pour lire ce qu'on vient de demander.
    useEffect(() => {
        if (q.trim()) setOpen(true);
    }, [q]);

    const users = data?.users ?? [];

    return (
        <div className="stack">
            {flash}

            {/* --- Les chiffres --------------------------------------------------- */}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <Figure value={data ? data.total : '—'} label="Comptes au total" accent />
                <Figure value={activity ? sum(activity.days, 'signups') : '—'} label={`Arrivées sur ${days} j`} />
                <Figure value={activity ? activity.days.at(-1)?.active ?? 0 : '—'} label="Actifs aujourd'hui" />
                <Figure
                    value={activity ? Math.max(...activity.days.map((d) => d.active), 0) : '—'}
                    label={`Pic d'activité sur ${days} j`}
                />
            </div>

            {/* --- La courbe ------------------------------------------------------ */}
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

                {!activity ? (
                    <p className="faint">Chargement…</p>
                ) : (
                    <ActivityChart days={activity.days} />
                )}

                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Les barres comptent les comptes créés dans la journée ; la ligne, les personnes qui se
                    sont manifestées ce jour-là. Séparées, ces deux séries ne disent pas grand-chose ; côte à
                    côte elles répondent à la question qui suit une annonce — les nouveaux venus sont-ils
                    restés ?
                </p>
            </section>

            {/* --- La liste, repliée par défaut ----------------------------------- */}
            <section className="panel stack" style={{ gap: '0.7rem' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                        className="btn btn--small"
                        aria-expanded={open}
                        onClick={() => setOpen((v) => !v)}
                    >
                        {open ? '▾' : '▸'} Liste des comptes
                        {data && (
                            <span className="faint data" style={{ marginLeft: '0.5rem' }}>
                                {q.trim() ? `${data.matching} trouvé${data.matching > 1 ? 's' : ''}` : data.total}
                            </span>
                        )}
                    </button>

                    <div className="field" style={{ margin: 0, minWidth: '16rem', flex: '1 1 16rem' }}>
                        <label htmlFor="q">Chercher un compte</label>
                        <input
                            id="q"
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="pseudo, nom affiché ou identifiant Discord"
                        />
                    </div>
                </div>

                {open && (
                    <>
                        {/* La liste est plafonnée à cent lignes côté serveur. On le dit
                plutôt que de laisser croire que le site n'a que cent comptes —
                c'est exactement ce que l'ancienne version laissait penser. */}
                        {data?.capped && (
                            <p className="notice">
                                {data.matching} comptes correspondent, les 100 premiers sont affichés. Affinez la
                                recherche pour atteindre les autres.
                            </p>
                        )}

                        {users.length === 0 ? (
                            <p className="empty">Aucun compte ne correspond.</p>
                        ) : (
                            <div className="panel panel--flush">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Compte</th>
                                            <th>Identifiant Discord</th>
                                            <th>Rôle</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.flatMap((u) => [
                                            <tr key={u.id}>
                                                <td>
                                                    <span className="row" style={{ gap: '0.5rem' }}>
                                                        {u.avatarUrl && <img className="avatar" src={u.avatarUrl} alt="" />}
                                                        <span>
                                                            {u.globalName ?? u.username}
                                                            {/* La date d'inscription sous le nom plutôt que
                                  dans une colonne : elle qualifie la personne,
                                  et une colonne de plus aurait poussé le
                                  sélecteur de rôle hors de l'écran étroit. */}
                                                            <span
                                                                className="faint data"
                                                                style={{ display: 'block', fontSize: '0.75rem' }}
                                                            >
                                                                inscrit le {formatDay(u.createdAt)}
                                                                {u.lastSeenAt && ` · vu le ${formatDay(u.lastSeenAt)}`}
                                                            </span>
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="data faint">{u.discordId}</td>
                                                <td>
                                                    <select
                                                        value={u.role}
                                                        // Un administrateur ne peut pas toucher au
                                                        // propriétaire, et personne ne se retire ses
                                                        // propres droits.
                                                        disabled={
                                                            u.id === currentUser.id ||
                                                            (u.role === 'OWNER' && !isOwner(currentUser))
                                                        }
                                                        aria-label={`Rôle de ${u.username}`}
                                                        onChange={(e) =>
                                                            run(async () => {
                                                                await api.patch(`/admin/users/${u.id}/role`, { role: e.target.value });
                                                                await reload();
                                                            }, 'Rôle mis à jour.')
                                                        }
                                                    >
                                                        <option value="USER">Membre</option>
                                                        <option value="ADMIN">Administrateur</option>
                                                        {/* Seul le propriétaire peut transmettre son rang ;
                                le serveur refuse de toute façon les autres cas. */}
                                                        {isOwner(currentUser) && <option value="OWNER">Propriétaire</option>}
                                                    </select>
                                                </td>
                                                <td className="num">
                                                    <button
                                                        className="btn btn--small btn--ghost"
                                                        aria-expanded={wallet === u.id}
                                                        onClick={() => setWallet(wallet === u.id ? null : u.id)}
                                                    >
                                                        Points
                                                    </button>
                                                </td>
                                            </tr>,

                                            /* Une ligne dépliée sous le compte plutôt qu'une fenêtre : on
                                               garde sous les yeux DE QUI il s'agit, ce qu'une modale fait
                                               précisément disparaître. */
                                            wallet === u.id ? (
                                                <tr key={`${u.id}-wallet`}>
                                                    <td colSpan={4} style={{ background: 'var(--surface-2)' }}>
                                                        <WalletPanel userId={u.id} run={run} />
                                                    </td>
                                                </tr>
                                            ) : null,
                                        ])}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>

            <p className="faint" style={{ fontSize: '0.85rem' }}>
                Un administrateur gère les événements, les artistes et les résultats, et distribue les
                rôles. Le propriétaire est le seul qu'aucun administrateur ne peut destituer ; il n'y en a
                qu'un, et il ne peut transmettre son rang qu'en le donnant à quelqu'un d'autre.
            </p>
        </div>
    );
}


/**
 * Le porte-monnaie d'un joueur : son solde, ses vingt dernières écritures, et
 * de quoi en ajouter une.
 *
 * Le motif est OBLIGATOIRE. Un crédit d'événement se justifie tout seul, il
 * porte le nom de la compète ; un crédit manuel ne porte rien. Sans motif, la
 * seule réponse possible à « d'où viennent ces cinq cents points ? » est « je
 * ne sais pas », et c'est une conversation qu'on n'a qu'une fois avant de le
 * regretter.
 */
function WalletPanel({ userId, run }) {
    const [data, setData] = useState(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const reload = () => api.get(`/admin/users/${userId}/wallet`).then(setData);

    useEffect(() => {
        setData(null);
        reload().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const value = Number(amount);
    const valid = Number.isInteger(value) && value !== 0 && note.trim().length > 0;

    async function submit(event) {
        event.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await run(async () => {
            const out = await api.post(`/admin/users/${userId}/wallet`, {
                amount: value,
                note: note.trim(),
            });
            setAmount('');
            setNote('');
            await reload();
            return `Porte-monnaie à ${out.balance} point(s).`;
        });
        setBusy(false);
    }

    if (!data) return <p className="faint" style={{ margin: '0.6rem 0' }}>Chargement…</p>;

    return (
        <div className="stack" style={{ gap: '0.7rem', padding: '0.6rem 0' }}>
            <div className="row" style={{ gap: '0.8rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span
                    className="display"
                    style={{ fontSize: 'calc(1.8rem * var(--display-scale))', color: 'var(--g)' }}
                >
                    {data.balance}
                </span>
                <span className="eyebrow" style={{ margin: 0 }}>points dépensables</span>
            </div>

            <form className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={submit}>
                <div className="field" style={{ margin: 0, width: '7rem' }}>
                    <label htmlFor={`amt-${userId}`}>Montant</label>
                    <input
                        id={`amt-${userId}`}
                        type="number"
                        step="1"
                        value={amount}
                        placeholder="250"
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </div>

                <div className="field" style={{ margin: 0, flex: '1 1 18rem' }}>
                    <label htmlFor={`note-${userId}`}>Motif</label>
                    <input
                        id={`note-${userId}`}
                        type="text"
                        maxLength={140}
                        value={note}
                        placeholder="concours de pronostics du live GBB26"
                        onChange={(e) => setNote(e.target.value)}
                    />
                </div>

                <button className="btn btn--small btn--primary" type="submit" disabled={!valid || busy}>
                    {value < 0 ? 'Retirer' : 'Créditer'}
                </button>
            </form>

            <p className="faint" style={{ fontSize: '0.8rem', margin: 0 }}>
                Un montant négatif reprend des points. Le score au classement n'est jamais touché : il
                reste la somme des pronostics, et rien ne le dépense.
            </p>

            {data.entries.length === 0 ? (
                <p className="empty">Aucun mouvement.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Origine</th>
                            <th className="num">Montant</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.entries.map((e) => (
                            <tr key={e.id}>
                                <td className="data faint">{formatDay(e.createdAt)}</td>
                                <td>
                                    {e.kind === 'EVENT_POINTS' && (e.event ? `${e.event.name} ${e.event.year}` : 'Compétition supprimée')}
                                    {e.kind === 'PURCHASE' && `Achat · ${e.itemId}`}
                                    {e.kind === 'GRANT' && (e.note ?? 'Crédit manuel')}
                                </td>
                                <td className="num" style={{ color: e.amount < 0 ? 'var(--m)' : 'var(--g)' }}>
                                    {e.amount > 0 ? `+${e.amount}` : e.amount}
                                </td>
                                <td className="num">
                                    {/* Seules les écritures manuelles s'annulent : le serveur refuse
                                        les autres, le bouton ne fait que dire la même chose plus tôt. */}
                                    {e.kind === 'GRANT' && (
                                        <button
                                            className="btn btn--small btn--ghost"
                                            onClick={() =>
                                                run(async () => {
                                                    await api.del(`/admin/wallet/${e.id}`);
                                                    await reload();
                                                    return 'Écriture annulée.';
                                                })
                                            }
                                        >
                                            Annuler
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);

/** AAAA-MM-JJ vers une date lisible. Le panneau d'administration est en français. */
function formatDay(value) {
    return new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
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