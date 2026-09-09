import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import MenuButton from './MenuButton.jsx';

/**
 * Les comptes écartés d'un événement.
 *
 * ─── Pourquoi ce n'est pas un bannissement ──────────────────────────────────
 *
 * Bannir ferme le site entier. C'est disproportionné quand le problème tient à
 * une seule compète : quelqu'un qui a triché sur le GBB 2026 n'a pas de raison
 * de perdre ses groupes, son palmarès et l'accès aux autres événements.
 * L'exclusion est le cran d'en dessous, et les deux mesures cohabitent.
 *
 * ─── Ce que l'écran doit dire, et qu'il serait tentant de taire ─────────────
 *
 * Écarter n'efface rien. Un pronostic déjà déposé reste au classement. C'est
 * délibéré — supprimer des points automatiquement, sur un incident pas toujours
 * avéré au moment où l'on ferme la porte, serait pire que le mal. Mais si
 * l'écran ne le disait pas, on croirait l'affaire réglée en écartant.
 *
 * D'où la colonne « pronostics déposés » : quand elle n'est pas à zéro, elle
 * renvoie explicitement vers l'onglet Recherche, seul endroit d'où l'on
 * supprime un pronostic.
 *
 * ─── La recherche de compte ─────────────────────────────────────────────────
 *
 * Elle ne part pas à la frappe. Trois lettres suffisent, et la même route que
 * l'onglet Comptes rend cent lignes au plus : une requête par caractère sur une
 * table de comptes est un coût qu'on ne paie pas pour un geste qu'on fait trois
 * fois par saison.
 */
export default function EventExclusions({ event, run }) {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState(null);

    const [q, setQ] = useState('');
    const [found, setFound] = useState([]);
    const [picked, setPicked] = useState(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const reload = () =>
        api.get(`/admin/events/${event.id}/exclusions`).then(({ exclusions }) => setRows(exclusions));

    useEffect(() => {
        setRows(null);
        setPicked(null);
        setQ('');
        reload().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id]);

    // Le délai évite une requête par lettre tapée. 300 ms : assez court pour
    // qu'on ne le remarque pas, assez long pour couvrir une frappe normale.
    useEffect(() => {
        const term = q.trim();
        if (term.length < 3) {
            setFound([]);
            return undefined;
        }
        const id = setTimeout(() => {
            api
                .get(`/admin/users?q=${encodeURIComponent(term)}`)
                .then(({ users }) => setFound(users.slice(0, 8)))
                .catch(() => { });
        }, 300);
        return () => clearTimeout(id);
    }, [q]);

    // Déjà écartés : on ne les repropose pas. Réappliquer met le motif à jour
    // côté serveur, mais le voir dans la liste des candidats laisserait croire
    // qu'il n'a rien été fait.
    const already = new Set((rows ?? []).map((e) => e.user.id));
    const candidates = found.filter((u) => !already.has(u.id));

    async function add() {
        if (!picked || !reason.trim() || busy) return;
        setBusy(true);
        await run(async () => {
            await api.post(`/admin/events/${event.id}/exclusions`, {
                userId: picked.id,
                reason: reason.trim(),
            });
            await reload();
            setPicked(null);
            setReason('');
            setQ('');
            return `${picked.globalName ?? picked.username} écarté de ${event.name} ${event.year}.`;
        });
        setBusy(false);
    }

    const count = rows?.length ?? 0;

    return (
        <div className="panel stack" style={{ gap: '0.6rem' }}>
            <div className="spread">
                <div>
                    <p className="eyebrow" style={{ margin: 0 }}>Accès</p>
                    <h3 style={{ margin: 0 }}>Comptes écartés</h3>
                </div>
                <div className="row" style={{ gap: '0.4rem' }}>
                    <span className="tag">{rows === null ? '—' : count}</span>
                    <button className="btn btn--small" aria-expanded={open} onClick={() => setOpen(!open)}>
                        {open ? 'Réduire' : 'Gérer'}
                    </button>
                </div>
            </div>

            {open && (
                <>
                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Un compte écarté ne peut plus enregistrer, déposer ni piocher sur cet événement. Il
                        continue de tout consulter, et garde l'accès au reste du site — c'est ce qui
                        distingue cette mesure d'un bannissement.
                    </p>

                    {/* --- Ajouter ------------------------------------------------ */}
                    <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field" style={{ margin: 0, flex: '1 1 15rem' }}>
                            <label htmlFor={`exc-q-${event.id}`}>Chercher un compte</label>
                            <input
                                id={`exc-q-${event.id}`}
                                type="search"
                                value={picked ? (picked.globalName ?? picked.username) : q}
                                placeholder="pseudo, nom affiché ou identifiant Discord"
                                onChange={(e) => { setPicked(null); setQ(e.target.value); }}
                            />
                        </div>

                        <div className="field" style={{ margin: 0, flex: '1 1 18rem' }}>
                            <label htmlFor={`exc-reason-${event.id}`}>Motif (obligatoire)</label>
                            <input
                                id={`exc-reason-${event.id}`}
                                type="text"
                                maxLength={280}
                                value={reason}
                                placeholder="pronostics déposés depuis deux comptes"
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>

                        <button
                            className="btn btn--small btn--danger"
                            disabled={!picked || !reason.trim() || busy}
                            onClick={add}
                        >
                            {busy ? 'En cours…' : 'Écarter'}
                        </button>
                    </div>

                    {/* Les candidats. Une liste courte et sous le champ : à huit
                        lignes on lit tout d'un coup, au-delà il faut taper une
                        lettre de plus. */}
                    {!picked && q.trim().length >= 3 && (
                        <div className="panel panel--flush">
                            {candidates.length === 0 ? (
                                <p className="empty" style={{ margin: 0, padding: '0.6rem' }}>
                                    Aucun compte à écarter sous ce nom.
                                </p>
                            ) : (
                                candidates.map((u) => (
                                    <button
                                        key={u.id}
                                        className="wc-suggest__item"
                                        onClick={() => { setPicked(u); setQ(''); }}
                                    >
                                        {u.avatarUrl && <img className="avatar" src={u.avatarUrl} alt="" />}
                                        <span>{u.globalName ?? u.username}</span>
                                        <span className="faint data" style={{ fontSize: '0.75rem' }}>
                                            {u.discordId}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {/* --- La liste ----------------------------------------------- */}
                    {rows === null ? (
                        <p className="faint">Chargement…</p>
                    ) : count === 0 ? (
                        <p className="empty">Aucun compte écarté de cet événement.</p>
                    ) : (
                        <div className="panel panel--flush">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Compte</th>
                                        <th>Motif</th>
                                        <th className="num">Pronos déposés</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((e) => (
                                        <tr key={e.id}>
                                            <td>
                                                <span className="row" style={{ gap: '0.5rem' }}>
                                                    {e.user.avatarUrl && <img className="avatar" src={e.user.avatarUrl} alt="" />}
                                                    <span>
                                                        {e.user.globalName ?? e.user.username}
                                                        <span
                                                            className="faint data"
                                                            style={{ display: 'block', fontSize: '0.72rem' }}
                                                        >
                                                            écarté le {formatDay(e.createdAt)}
                                                            {e.by && ` par ${e.by.globalName ?? e.by.username}`}
                                                        </span>
                                                    </span>
                                                </span>
                                            </td>

                                            <td className="data" style={{ fontSize: '0.82rem' }}>{e.reason}</td>

                                            {/* Le nombre qui empêche de croire l'affaire réglée :
                                                écarter ne retire pas ce qui est déjà déposé. */}
                                            <td className="num">
                                                {e.filedPredictions > 0 ? (
                                                    <span style={{ color: 'var(--m)' }}>{e.filedPredictions}</span>
                                                ) : (
                                                    <span className="faint">0</span>
                                                )}
                                            </td>

                                            <td className="num">
                                                <MenuButton
                                                    label={`Actions pour ${e.user.username}`}
                                                    items={[
                                                        {
                                                            label: "Lever l'exclusion",
                                                            onClick: () =>
                                                                run(async () => {
                                                                    await api.del(`/admin/exclusions/${e.id}`);
                                                                    await reload();
                                                                    return `${e.user.globalName ?? e.user.username} réintégré.`;
                                                                }),
                                                        },
                                                    ]}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {rows?.some((e) => e.filedPredictions > 0) && (
                        <p className="notice" style={{ margin: 0 }}>
                            Certains de ces comptes ont déjà des pronostics déposés sur l'événement : ils
                            comptent toujours au classement. Écarter ferme la porte, cela n'efface rien.
                            Pour les retirer, passez par l'onglet Recherche et supprimez-les un par un.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

/** AAAA-MM-JJ vers une date lisible. Le panneau d'administration est en français. */
function formatDay(value) {
    return new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}