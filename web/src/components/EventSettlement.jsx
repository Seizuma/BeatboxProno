import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Le palmarès distribué par la clôture d'une compète.
 *
 * ─── Pourquoi cet écran existe ──────────────────────────────────────────────
 *
 * Passer un événement en « terminé » distribue des badges et crédite le
 * porte-monnaie. C'était un aller sans retour : aucun écran ne permettait de
 * reprendre ce qui avait été donné. Une compète close par erreur — ou close
 * alors qu'elle n'était pas censée récompenser quoi que ce soit — laissait ses
 * badges définitivement accrochés aux profils.
 *
 * ─── La liste avant le bouton ───────────────────────────────────────────────
 *
 * Le panneau montre QUI porte quoi avant de proposer de retirer. « Annuler la
 * clôture » ne dit rien ; « 47 badges et 3 100 points chez 19 personnes » se
 * décide.
 *
 * La colonne d'anomalie répond à la question qui amène ici : un badge posé sur
 * quelqu'un qui n'a pas déposé de pronostic sur cette compète. Le code ne
 * devrait jamais en produire — la distribution part de la liste des déposants
 * de l'événement — mais tant qu'on ne peut pas le vérifier soi-même, on
 * soupçonne le code. Une ligne vide vaut mieux qu'une supposition.
 */
export default function EventSettlement({ event, run }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [confirming, setConfirming] = useState(null);

    const reload = () =>
        api.get(`/admin/events/${event.id}/settlement`).then(setData).catch(() => { });

    useEffect(() => {
        setData(null);
        setConfirming(null);
        reload().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id]);

    async function revoke() {
        await run(async () => {
            const res = await api.del(`/admin/events/${event.id}/settlement?confirm=true`);
            await reload();
            setConfirming(null);
            return `${res.badges} badge(s) et ${res.credits} crédit(s) retirés.`;
        });
    }

    const awards = data?.awards ?? 0;

    return (
        <div className="panel stack" style={{ gap: '0.6rem' }}>
            <div className="spread">
                <div>
                    <p className="eyebrow" style={{ margin: 0 }}>Clôture</p>
                    <h3 style={{ margin: 0 }}>Badges et points distribués</h3>
                </div>
                <div className="row" style={{ gap: '0.4rem' }}>
                    <span className="tag">{data === null ? '—' : `${awards} badges`}</span>
                    <button className="btn btn--small" aria-expanded={open} onClick={() => setOpen(!open)}>
                        {open ? 'Réduire' : 'Voir'}
                    </button>
                </div>
            </div>

            {open && (
                <>
                    {data === null ? (
                        <p className="faint">Chargement…</p>
                    ) : awards === 0 ? (
                        <p className="empty">
                            Cette compète n'a rien distribué. Les badges et le crédit sont posés au passage
                            en « terminé ».
                        </p>
                    ) : (
                        <>
                            <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                                {data.awards} badge(s) et {data.credited} point(s) répartis sur{' '}
                                {data.holders.length} compte(s). {data.players} personne(s) ont déposé un
                                pronostic sur cet événement.
                            </p>

                            {data.orphans > 0 && (
                                <p className="notice" style={{ margin: 0 }}>
                                    {data.orphans} compte(s) portent un badge sans avoir déposé de pronostic
                                    sur cette compète. Ce cas ne devrait pas exister — signalez-le, la
                                    distribution part pourtant de la liste des déposants.
                                </p>
                            )}

                            <div className="panel panel--flush">
                                <table>
                                    <thead>
                                        <tr><th>Compte</th><th>Badges</th><th className="num">État</th></tr>
                                    </thead>
                                    <tbody>
                                        {data.holders.map((h) => (
                                            <tr key={h.user.id}>
                                                <td>{h.user.globalName ?? h.user.username}</td>
                                                <td className="data" style={{ fontSize: '0.8rem' }}>
                                                    {h.codes.join(' · ')}
                                                </td>
                                                <td className="num">
                                                    {h.orphan
                                                        ? <span style={{ color: 'var(--r)' }}>sans prono</span>
                                                        : <span className="faint">a déposé</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {confirming ? (
                                <div className="panel stack" style={{ gap: '0.6rem', borderColor: 'var(--r)' }}>
                                    <p className="notice" style={{ margin: 0 }}>{confirming}</p>
                                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                                        Les crédits accordés à la main depuis l'onglet Joueurs ne partent pas :
                                        seul le crédit automatique de clôture est repris. Un solde peut passer
                                        sous zéro si les points ont déjà été dépensés — cela bloque les achats
                                        suivants sans jamais confisquer un objet déjà porté.
                                    </p>
                                    <div className="row" style={{ gap: '0.4rem' }}>
                                        <button className="btn btn--small btn--danger" onClick={revoke}>
                                            Retirer définitivement
                                        </button>
                                        <button className="btn btn--small" onClick={() => setConfirming(null)}>
                                            Annuler
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="row" style={{ gap: '0.4rem' }}>
                                    <button
                                        className="btn btn--small btn--danger"
                                        onClick={() =>
                                            api
                                                .del(`/admin/events/${event.id}/settlement`)
                                                .catch((e) => setConfirming(e.message))
                                        }
                                    >
                                        Retirer badges et points
                                    </button>
                                    <span className="faint" style={{ fontSize: '0.85rem' }}>
                                        Repasser la compète en « terminé » les redistribuera.
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}