import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import ReadingBoards from './ReadingBoards.jsx';
import ArtistFigure from './ArtistFigure.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Sous ce nombre de participants mesurés, une catégorie n'a pas de palmarès.
 *
 * Un top 5 sur quatre crews, c'est la catégorie entière rangée trois fois de
 * suite dans trois ordres différents : ça donne l'apparence d'un verdict sans
 * en être un. Huit est le seuil à partir duquel cinq lignes en désignent
 * vraiment cinq — la moitié du plateau, pas plus.
 */
const PALMARES_MIN = 8;

/**
 * Les statistiques de lecture d'un événement, en fenêtre.
 *
 * ─── Pourquoi une fenêtre, et pas la page ───────────────────────────────────
 *
 * On vient sur la page événement pour SON pronostic. Ce que la foule entière a
 * cru est une autre question, et déplier quatre tableaux sous l'éditeur
 * enterrait la première sous la seconde. Derrière un bouton, chacune arrive
 * quand on la demande.
 *
 * ─── Deux rangs d'onglets, qui ne découpent pas la même chose ───────────────
 *
 * La CATÉGORIE d'abord, et c'est le rang principal. Sans elle, les palmarès
 * mélangeaient vingt solistes et quatre crews dans un même classement d'écarts :
 * un « +9,6 » en Solo demande de s'être trompé de dix places, un « +1,4 » en
 * Crew est presque le maximum possible sur un plateau de quatre. Les deux
 * chiffres se lisaient côte à côte comme s'ils disaient la même chose. Ils ne
 * la disaient pas. Un écart n'est comparable qu'à taille de plateau égale, donc
 * la comparaison ne sort jamais de sa catégorie.
 *
 * La VUE ensuite, en rang secondaire. Les palmarès disent QUI a surpris : on
 * les lit de haut en bas, l'ordre porte le sens. La liste complète sert à
 * chercher UN nom : on la parcourt, l'ordre n'est qu'un moyen de s'y retrouver.
 * On ne mélange pas un verdict et un annuaire.
 *
 * Les deux découpages sont indépendants — l'un règle la comparabilité, l'autre
 * la lisibilité — d'où deux rangs plutôt qu'une liste combinatoire.
 *
 * ─── Pourquoi les palmarès sont calculés ICI ────────────────────────────────
 *
 * Le serveur en renvoie déjà trois, mais toutes catégories confondues : c'est
 * précisément le mélange qu'on veut défaire. Or il envoie aussi, avec `full=1`,
 * la liste complète des lignes mesurées — nom, place attendue, place réelle,
 * écart, nombre d'avis. Tout ce qu'il faut pour trier est donc déjà là, et
 * demander au serveur un jeu de palmarès par catégorie multiplierait les
 * requêtes pour un tri sur trente lignes que le navigateur fait en une
 * milliseconde.
 *
 * ─── Pourquoi le chargement vit ici ─────────────────────────────────────────
 *
 * La requête part à l'OUVERTURE de la fenêtre, pas au chargement de la page.
 * C'est une agrégation sur tous les pronostics déposés d'une compète : la faire
 * payer à chaque visite, pour un panneau que la plupart n'ouvriront jamais,
 * serait un mauvais marché. Le composant n'est monté que lorsqu'on clique, donc
 * l'effet se déclenche au bon moment sans qu'on ait à le conditionner.
 */
export default function ResultStats({ slug, onClose }) {
    const { t, number } = useI18n();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [cat, setCat] = useState(null);
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

    const toutes = data?.readings?.all ?? [];
    const sampled = data?.readings?.sampled ?? 0;

    // Les catégories dans l'ordre où le serveur les a triées, c'est-à-dire
    // celui de la compète. `Set` sur un tableau déjà groupé : l'ordre de
    // première apparition est le bon.
    const categories = useMemo(() => [...new Set(toutes.map((r) => r.category))], [toutes]);

    // La catégorie ouverte, choisie une fois les données arrivées. Un effet
    // plutôt qu'une valeur par défaut : au premier rendu la liste est vide, et
    // un état initial calculé dessus resterait nul pour toujours.
    useEffect(() => {
        if (cat == null && categories.length) setCat(categories[0]);
    }, [categories, cat]);

    const lignes = useMemo(
        () => toutes.filter((r) => r.category === cat),
        [toutes, cat]
    );

    /**
     * L'annuaire, regroupé par phase.
     *
     * Une catégorie peut publier plusieurs classements — un placement, puis des
     * éliminations — et leurs places n'ont rien à voir : la même personne y
     * figure deux fois, 3e ici et 12e là. Sans intertitre, la colonne « place »
     * repartait à 1 en plein milieu du tableau sans que rien ne l'explique.
     *
     * Le serveur trie déjà par phase puis par place, donc un simple parcours
     * suffit à découper les groupes : pas de tri à refaire, et l'ordre de
     * déroulement de la compète est conservé.
     */
    const parPhase = useMemo(() => {
        const out = [];
        for (const r of lignes) {
            const dernier = out[out.length - 1];
            if (dernier && dernier.phaseId === r.phaseId) dernier.rows.push(r);
            else out.push({ phaseId: r.phaseId, phase: r.phase, rows: [r] });
        }
        return out;
    }, [lignes]);

    /**
     * Les trois palmarès de la catégorie ouverte.
     *
     * Même définition que côté serveur, à ceci près que le périmètre s'arrête à
     * la catégorie : les mieux lus sont les écarts les plus faibles, les
     * sous-cotés ceux qui ont fini au-dessus de ce qu'on croyait, les surcotés
     * l'inverse. Les listes sont copiées avant tri — `sort` travaille en place,
     * et réordonner `lignes` ferait bouger l'annuaire sous les pieds de l'autre
     * onglet.
     */
    const palmares = useMemo(() => {
        if (lignes.length < PALMARES_MIN) return null;
        const justesse = [...lignes].sort((x, y) => Math.abs(x.delta) - Math.abs(y.delta));
        const surprise = [...lignes].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
        return {
            sampled: lignes.length,
            wellRead: justesse.slice(0, 5),
            underRated: surprise.filter((r) => r.delta > 0).slice(0, 5),
            overRated: surprise.filter((r) => r.delta < 0).slice(0, 5),
        };
    }, [lignes]);

    const onglet = (actif, sur, texte, principal) => (
        <button
            className={`btn btn--small${actif ? (principal ? ' btn--primary' : '') : ' btn--ghost'}`}
            aria-pressed={actif}
            onClick={sur}
        >
            {texte}
        </button>
    );

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
                    {/* Le rang des catégories ne s'affiche pas quand il n'y en a
                        qu'une : un onglet unique n'offre aucun choix, il ne fait
                        que prendre une ligne pour dire ce que le titre dit
                        déjà. */}
                    {categories.length > 1 && (
                        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                            {categories.map((c) => onglet(c === cat, () => setCat(c), c, true))}
                        </div>
                    )}

                    <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                        {onglet(tab === 'boards', () => setTab('boards'), t('stats.tab.boards'), false)}
                        {onglet(tab === 'all', () => setTab('all'), t('stats.tab.all'), false)}
                    </div>

                    {tab === 'boards' && (
                        palmares ? (
                            <div className="stack" style={{ gap: '1.5rem' }}>
                                {/* La catégorie est coupée : l'onglet l'annonce. */}
                                <ReadingBoards readings={palmares} showCategory={false} />
                            </div>
                        ) : (
                            <p className="empty">{t('stats.tooSmall', { n: PALMARES_MIN })}</p>
                        )
                    )}

                    {tab === 'all' && (
                        <section className="stack" style={{ gap: '0.6rem' }}>
                            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                                {t('stats.all.lede')}
                            </p>
                            {parPhase.map((groupe) => (
                              <div key={groupe.phaseId} className="stack" style={{ gap: '0.35rem' }}>
                                {/* L'intertitre n'apparaît qu'à partir de deux
                                    classements : sur une catégorie qui n'en
                                    publie qu'un, il répéterait ce que l'onglet
                                    dit déjà. */}
                                {parPhase.length > 1 && (
                                  <p className="eyebrow" style={{ margin: 0 }}>{groupe.phase}</p>
                                )}
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
                                            // La clé porte la phase : un même
                                            // participant classé dans deux phases
                                            // donnait deux lignes de clé identique,
                                            // et React n'en gardait qu'une.
                                            <tr key={`${r.contenderId}:${r.phaseId}`}>
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
                                                    // Le signe porte le sens, la couleur ne fait que
                                                    // le répéter plus vite : vert, il a fini au-dessus
                                                    // de ce qu'on croyait.
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