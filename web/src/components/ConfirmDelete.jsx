import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';


const TITLES = {
    artist: "Supprimer l'artiste",
    event: "Supprimer l'événement",
    category: 'Supprimer la catégorie',
    contender: 'Retirer le participant',
    prediction: 'Supprimer le pronostic',
};

/**
 * Confirmation de suppression. Le bilan vient du serveur — la même fonction qui
 * garde la route — plutôt que d'être redit ici : deux formulations finiraient
 * par diverger, et c'est celle de l'écran qu'on croirait.
 *
 * Rien n'est supprimé tant qu'on n'a pas relu ce bilan et cliqué.
 */
export default function ConfirmDelete({ kind, id, onCancel, onConfirmed }) {
    const [impact, setImpact] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [keepOrphans, setKeepOrphans] = useState(false);

    useEffect(() => {
        setImpact(null);
        setError(null);
        api
            .get(`/admin/impact/${kind}/${id}`)
            .then(({ impact }) => setImpact(impact))
            .catch((e) => setError(e.message));
    }, [kind, id]);

    const paths = {
        artist: `/admin/artists/${id}?confirm=true${keepOrphans ? '&keep=true' : ''}`,
        event: `/admin/events/${id}?confirm=true`,
        category: `/admin/categories/${id}?confirm=true`,
        contender: `/admin/contenders/${id}?confirm=true`,
        prediction: `/admin/predictions/${id}?confirm=true`,
    };

    const remove = async () => {
        setBusy(true);
        try {
            const result = await api.del(paths[kind]);
            onConfirmed(result);
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return (
        <Modal
            title={TITLES[kind] ?? 'Supprimer'}
            subtitle={impact?.name}
            onClose={onCancel}
            footer={
                <>
                    <button className="btn btn--danger" disabled={busy || !impact} onClick={remove}>
                        {busy ? 'Suppression…' : 'Supprimer définitivement'}
                    </button>
                    <button className="btn" onClick={onCancel} disabled={busy}>
                        Annuler
                    </button>
                </>
            }
        >
            {error && <p className="notice">{error}</p>}
            {!impact && !error && <p className="faint">Analyse en cours…</p>}

            {impact && (
                <>
                    <p className="notice">Cette action est définitive. Rien ne pourra être récupéré.</p>

                    {kind === 'artist' && <ArtistImpact impact={impact} keep={keepOrphans} setKeep={setKeepOrphans} />}
                    {kind === 'event' && <EventImpact impact={impact} />}
                    {kind === 'category' && <CategoryImpact impact={impact} />}
                    {kind === 'contender' && <ContenderImpact impact={impact} />}
                    {kind === 'prediction' && <PredictionImpact impact={impact} />}
                </>
            )}
        </Modal>
    );
}

function Line({ value, label, warn }) {
    return (
        <span className="readout">
            <span className="readout__value" style={warn && value > 0 ? { color: 'var(--r)' } : undefined}>
                {value}
            </span>
            <span className="readout__unit">{label}</span>
        </span>
    );
}

function ArtistImpact({ impact, keep, setKeep }) {
    const { contenders, orphans, events } = impact;

    if (contenders.length === 0) {
        return <p className="faint">Cet artiste n'est engagé sur aucun événement. Suppression sans conséquence.</p>;
    }

    return (
        <>
            <div className="row" style={{ gap: '1.5rem' }}>
                <Line value={contenders.length} label="participations" />
                <Line value={events.length} label="événements" />
                <Line value={orphans.length} label="participants vidés" warn />
            </div>

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr><th>Participant</th><th>Catégorie</th><th>Événement</th><th>Devient</th></tr>
                    </thead>
                    <tbody>
                        {contenders.map((c) => (
                            <tr key={c.id}>
                                <td>{c.name}</td>
                                <td className="muted">{c.category}</td>
                                <td className="muted">{c.event}</td>
                                <td>
                                    {c.orphaned ? (
                                        <span className="tag" style={{ borderColor: 'var(--r)', color: 'var(--r)' }}>
                                            sans artiste
                                        </span>
                                    ) : (
                                        <span className="tag">reste valide</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {orphans.length > 0 && (
                <div className="stack" style={{ gap: '0.4rem' }}>
                    <label style={{ margin: 0, color: 'var(--ink)', textTransform: 'none', letterSpacing: 0 }}>
                        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />{' '}
                        Garder ces participants sous leur nom actuel
                    </label>
                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        {keep
                            ? "Ils resteront engagés dans leurs événements, mais sans artiste rattaché : plus de photo, plus de fiche."
                            : "Ils seront retirés de leurs événements. C'est le choix par défaut : un participant sans artiste est un fantôme dans les arbres de battles."}
                    </p>
                </div>
            )}
        </>
    );
}

function EventImpact({ impact }) {
    return (
        <>
            <div className="row" style={{ gap: '1.5rem' }}>
                <Line value={impact.categories.length} label="catégories" />
                <Line value={impact.predictions} label="pronostics perdus" warn />
            </div>
            {impact.categories.length > 0 && (
                <div className="panel panel--flush">
                    <table>
                        <thead>
                            <tr><th>Catégorie</th><th className="num">Participants</th><th className="num">Phases</th><th className="num">Pronostics</th></tr>
                        </thead>
                        <tbody>
                            {impact.categories.map((c) => (
                                <tr key={c.name}>
                                    <td>{c.name}</td>
                                    <td className="num">{c.contenders}</td>
                                    <td className="num">{c.phases}</td>
                                    <td className="num">{c.predictions}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {impact.predictions > 0 && (
                <p className="notice">
                    Les pronostics déjà déposés par les joueurs seront effacés, ainsi que les points
                    correspondants au classement.
                </p>
            )}
        </>
    );
}

function CategoryImpact({ impact }) {
    return (
        <>
            <p className="faint" style={{ margin: 0 }}>{impact.event}</p>
            <div className="row" style={{ gap: '1.5rem' }}>
                <Line value={impact.contenders} label="participants" />
                <Line value={impact.phases} label="phases" />
                <Line value={impact.predictions} label="pronostics perdus" warn />
            </div>
            {impact.predictions > 0 && (
                <p className="notice">
                    Les pronostics des joueurs sur cette catégorie disparaîtront, avec leurs points.
                </p>
            )}
        </>
    );
}

/**
 * Le bilan d'une suppression de pronostic.
 *
 * Deux informations décident, et elles sont mises en avant : est-il DÉPOSÉ, et
 * combien vaut-il. Un brouillon ne pèse rien ; un pronostic déposé et scoré
 * retire des points d'un classement où d'autres se comparent à lui.
 *
 * Le nom du joueur, l'événement et la catégorie sont là pour une raison plus
 * bête et plus importante : reconnaître qu'on a bien la bonne fiche sous les
 * yeux. Une recherche rend souvent trois lignes qui se ressemblent.
 */
function PredictionImpact({ impact }) {
    return (
        <>
            <p className="faint" style={{ margin: 0 }}>
                {impact.event} — {impact.category}
                {impact.label ? ` · « ${impact.label} »` : ''}
            </p>

            <div className="row" style={{ gap: '1.5rem' }}>
                <Line value={impact.points} label="points au classement" warn={impact.submitted} />
                <Line value={impact.ranks} label="classements" />
                <Line value={impact.battles} label="affiches" />
                <Line value={impact.comments} label="commentaires" />
            </div>

            {impact.submitted ? (
                <p className="notice">
                    C'est le pronostic DÉPOSÉ de ce joueur
                    {impact.scored ? ', et il est déjà scoré' : ''}. Le supprimer lui retire ces points :
                    le classement des autres joueurs, lui, ne bouge pas.
                </p>
            ) : (
                <p className="faint" style={{ margin: 0 }}>
                    C'est un brouillon : il n'est publié nulle part et ne compte pour aucun classement.
                </p>
            )}

            <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                Les points déjà versés au porte-monnaie ne reviennent pas : ils ont été crédités à la
                clôture de l'événement. Reprenez-les depuis l'onglet Comptes si c'est l'intention.
            </p>
        </>
    );
}

function ContenderImpact({ impact }) {
    return (
        <>
            <p className="faint" style={{ margin: 0 }}>{impact.event} — {impact.category}</p>
            <div className="row" style={{ gap: '1.5rem' }}>
                <Line value={impact.battles} label="affiches" warn />
                <Line value={impact.rankings} label="classements officiels" />
                <Line value={impact.predictedRanks} label="pronostics le citant" warn />
            </div>
            {impact.battles > 0 && (
                <p className="notice">
                    Les affiches où il apparaît seront vidées de son côté : l'arbre gardera des cases à
                    redéfinir.
                </p>
            )}
        </>
    );
}