import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import ReadingBoards from './ReadingBoards.jsx';
import ArtistFigure from './ArtistFigure.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Les statistiques de lecture d'un événement, en fenêtre.
 *
 * ─── Pourquoi une fenêtre, et pas la page ───────────────────────────────────
 *
 * On vient sur la page événement pour SON pronostic. Ce que la foule entière a
 * cru est une autre question, et déplier trois tableaux plus une liste de cent
 * participants sous l'éditeur enterrait la première sous la seconde. Derrière
 * un bouton, chacune arrive quand on la demande.
 *
 * ─── Pourquoi le chargement vit ici ─────────────────────────────────────────
 *
 * La requête part à l'OUVERTURE de la fenêtre, pas au chargement de la page.
 * C'est une agrégation sur tous les pronostics déposés d'une compète, à laquelle
 * s'ajoute ici la liste complète des participants : la faire payer à chaque
 * visite, pour un panneau que la plupart n'ouvriront jamais, serait un mauvais
 * marché. Le composant n'est monté que lorsqu'on clique, donc l'effet se
 * déclenche au bon moment sans qu'on ait à le conditionner.
 */
export default function ResultStats({ slug, onClose }) {
    const { t, number } = useI18n();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        // « /scoreboard » et non « /stats » : les bloqueurs de pub coupent les
        // requêtes contenant « /stats? » avant même qu'elles partent.
        // `full=1` demande la liste complète des participants mesurés.
        api
            .get(`/scoreboard?event=${encodeURIComponent(slug)}&full=1`)
            .then((board) => { if (!cancelled) setData(board); })
            .catch((e) => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [slug]);

    const readings = data?.readings ?? null;
    const sampled = readings?.sampled ?? 0;

    return (
        <Modal
            wide
            title={t('stats.results.title')}
            subtitle={t('stats.results.subtitle')}
            onClose={onClose}
            footer={
                <>
                    {sampled > 0 && (
                        <span className="faint data" style={{ fontSize: '0.8rem' }}>
                            {t('stats.results.sampled', { n: number(sampled) })}
                        </span>
                    )}
                    <button className="btn btn--ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>
                        {t('thread.close')}
                    </button>
                </>
            }
        >
            {error && <p className="notice">{error}</p>}
            {!data && !error && <p className="faint">{t('common.loading')}</p>}

            {/* Le seuil de trois avis vit côté serveur : sous trois personnes,
                une « place moyenne pronostiquée » ne mesure rien. Une compète
                qui n'a pas encore assez de pronostics déposés renvoie donc zéro
                ligne, et le dire vaut mieux que d'afficher trois tableaux
                vides. */}
            {data && sampled === 0 && <p className="empty">{t('stats.empty')}</p>}

            {sampled > 0 && (
                <div className="stack" style={{ gap: '1.5rem' }}>
                    <ReadingBoards readings={readings} />

                    {readings.all?.length > 0 && (
                        <section className="stack">
                            <div>
                                <h2>{t('stats.all')}</h2>
                                <p className="muted" style={{ fontSize: '0.88rem' }}>{t('stats.all.lede')}</p>
                            </div>
                            <div className="panel panel--flush">
                                <table>
                                    <thead>
                                        <tr>
                                            <th className="num">{t('result.col.rank')}</th>
                                            <th>{t('stats.col.artist')}</th>
                                            <th className="num">{t('stats.col.expected')}</th>
                                            <th className="num">{t('stats.col.gap')}</th>
                                            <th className="num col-opt">{t('stats.col.voters')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {readings.all.map((r) => (
                                            <tr key={r.contenderId}>
                                                <td className="num data">{r.actual}</td>
                                                <td>
                                                    <span className="stat-row">
                                                        <ArtistFigure src={r.imageUrl} name={r.name} size="xs" />
                                                        <span>
                                                            {r.name}
                                                            <span className="faint data" style={{ fontSize: '0.78rem', display: 'block' }}>
                                                                {r.category}
                                                            </span>
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="num muted">{r.expected}</td>
                                                <td
                                                    className="num data"
                                                    // Le signe porte le sens, la couleur ne fait que
                                                    // le répéter plus vite : vert, il a fini
                                                    // au-dessus de ce qu'on croyait.
                                                    style={{
                                                        color:
                                                            r.delta > 0 ? 'var(--ok)'
                                                                : r.delta < 0 ? 'var(--r)'
                                                                    : undefined,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                                                </td>
                                                <td className="num muted col-opt">{r.voters}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </Modal>
    );
}