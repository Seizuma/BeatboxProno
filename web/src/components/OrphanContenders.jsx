import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import ArtistFigure from './ArtistFigure.jsx';

/**
 * Les participants engagés dans un événement sans aucun artiste derrière.
 *
 * Le cas typique : en Crew et Tag Team, « Berywam » ou « Colaps & Zekka » ont
 * été saisis au clavier sans rattachement. Le nom existe alors dans l'arbre de
 * battles mais nulle part ailleurs — pas dans la liste des artistes, pas de
 * photo, pas de fiche. Ce panneau réconcilie les deux : quand un artiste porte
 * déjà ce nom, on rattache ; sinon on le crée.
 */
export default function OrphanContenders({ onDone }) {
    const [orphans, setOrphans] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const load = () =>
        api
            .get('/admin/orphan-contenders')
            .then(({ orphans }) => setOrphans(orphans))
            .catch((e) => setError(e.message));

    useEffect(() => { load(); }, []);

    const repair = async (ids) => {
        setBusy(true);
        setError(null);
        try {
            const res = await api.post('/admin/orphan-contenders/repair', ids ? { ids } : {});
            setResult(res);
            await load();
            await onDone?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (error) return <p className="notice">{error}</p>;
    if (!orphans) return null;

    // Rien à signaler : on n'encombre pas l'écran d'un panneau vide.
    if (orphans.length === 0) {
        return result ? (
            <p className="notice notice--ok">
                {result.repaired} participant(s) réconcilié(s) — {result.linked} rattaché(s) à un artiste
                existant, {result.created} artiste(s) créé(s).
            </p>
        ) : null;
    }

    const linkable = orphans.filter((o) => o.match).length;

    return (
        <section className="panel stack">
            <div className="spread">
                <div>
                    <p className="eyebrow" style={{ margin: 0 }}>Incohérence détectée</p>
                    <h2>Participants sans artiste</h2>
                </div>
                <button className="btn btn--primary" disabled={busy} onClick={() => repair(null)}>
                    {busy ? 'Réparation…' : `Tout réconcilier (${orphans.length})`}
                </button>
            </div>

            <p className="faint" style={{ fontSize: '0.88rem', margin: 0 }}>
                Ces noms apparaissent dans des événements mais n'existent pas dans la liste des artistes :
                ils n'ont donc ni photo ni fiche.
                {linkable > 0 && ` ${linkable} d'entre eux correspondent à un artiste déjà enregistré et seront simplement rattachés.`}
            </p>

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr><th>Participant</th><th>Catégorie</th><th>Événement</th><th>Action</th><th></th></tr>
                    </thead>
                    <tbody>
                        {orphans.map((o) => (
                            <tr key={o.id}>
                                <td>{o.name}</td>
                                <td className="muted">{o.category}</td>
                                <td className="muted">{o.event}</td>
                                <td>
                                    {o.match ? (
                                        <span className="row" style={{ gap: '0.45rem' }}>
                                            <ArtistFigure src={o.match.imageUrl} name={o.match.name} size="xs" />
                                            <span className="tag tag--live">rattacher à {o.match.name}</span>
                                        </span>
                                    ) : (
                                        <span className="tag">créer l'artiste</span>
                                    )}
                                </td>
                                <td className="num">
                                    <button className="btn btn--small" disabled={busy} onClick={() => repair([o.id])}>
                                        Réconcilier
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}