import { useEffect, useMemo, useState } from 'react';
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
 * ─── Pourquoi deux onglets ──────────────────────────────────────────────────
 *
 * La première version empilait les quatre tableaux à la suite. Sur un téléphone
 * de 360 pixels, ça donnait quatre grilles de cinq colonnes séparées par des
 * titres qu'on dépassait au défilement : impossible de savoir, à mi-hauteur,
 * lequel on était en train de lire.
 *
 * Or ces tableaux répondent à deux questions distinctes. Les palmarès disent
 * QUI a surpris — on les lit de haut en bas, l'ordre porte le sens. La liste
 * complète sert à chercher UN nom — on la parcourt, l'ordre n'est qu'un moyen
 * de s'y retrouver. Deux usages, deux onglets : on ne mélange pas un verdict et
 * un annuaire.
 *
 * ─── Pourquoi le chargement vit ici ─────────────────────────────────────────
 *
 * La requête part à l'OUVERTURE de la fenêtre, pas au chargement de la page.
 * C'est une agrégation sur tous les pronostics déposés d'une compète, à laquelle
 * s'ajoute la liste complète des participants : la faire payer à chaque visite,
 * pour un panneau que la plupart n'ouvriront jamais, serait un mauvais marché.
 * Le composant n'est monté que lorsqu'on clique, donc l'effet se déclenche au
 * bon moment sans qu'on ait à le conditionner.
 */
export default function ResultStats({ slug, onClose }) {
    const { t, number } = useI18n();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('boards');

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

    /**
     * La liste complète, regroupée par catégorie.
     *
     * Répéter « Solo » sous chacun des trente noms d'une catégorie Solo occupe
     * une ligne de texte par participant pour une information qui ne change pas.
     * Un intertitre la dit une fois, et rend au passage la frontière entre deux
     * catégories visible — sans elle, la place repartait à 1 au milieu du
     * tableau sans que rien ne l'explique.
     */
    const groupes = useMemo(() => {
        const out = [];
        for (const r of readings?.all ?? []) {
            const dernier = out[out.length - 1];
            if (dernier && dernier.category === r.category) dernier.rows.push(r);
            else out.push({ category: r.category, rows: [r] });
        }
        return out;
    }, [readings]);

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
                ligne, et le dire vaut mieux que d'afficher des tableaux vides. */}
            {data && sampled === 0 && <p className="empty">{t('stats.empty')}</p>}

            {sampled > 0 && (
                <div className="stack" style={{ gap: '1rem' }}>
                    <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            className={`btn btn--small${tab === 'boards' ? ' btn--primary' : ' btn--ghost'}`}
                            aria-pressed={tab === 'boards'}
                            onClick={() => setTab('boards')}
                        >
                            {t('stats.tab.boards')}
                        </button>
                        <button
                            className={`btn btn--small${tab === 'all' ? ' btn--primary' : ' btn--ghost'}`}
                            aria-pressed={tab === 'all'}
                            onClick={() => setTab('all')}
                        >
                            {t('stats.tab.all')}
                        </button>
                    </div>

                    {tab === 'boards' && (
                        <div className="stack" style={{ gap: '1.5rem' }}>
                            <ReadingBoards readings={readings} />
                        </div>
                    )}

                    {tab === 'all' && (
                        <section className="stack" style={{ gap: '0.6rem' }}>
                            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                                {t('stats.all.lede')}
                            </p>

                            {groupes.map((groupe) => (
                                <div key={groupe.category} className="stack" style={{ gap: '0.35rem' }}>
                                    <p className="eyebrow" style={{ margin: 0 }}>{groupe.category}</p>
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
                                                {groupe.rows.map((r) => (
                                                    <tr key={r.contenderId}>
                                                        <td className="num data">{r.actual}</td>
                                                        <td>
                                                            <span className="stat-row">
                                                                <ArtistFigure src={r.imageUrl} name={r.name} size="xs" />
                                                                <span>{r.name}</span>
                                                            </span>
                                                        </td>
                                                        <td className="num muted">{r.expected}</td>
                                                        <td
                                                            className="num data"
                                                            // Le signe porte le sens, la couleur ne fait
                                                            // que le répéter plus vite : vert, il a fini
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
                                </div>
                            ))}
                        </section>
                    )}
                </div>
            )}
        </Modal>
    );
}