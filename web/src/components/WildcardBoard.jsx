import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import ArtistFigure from './ArtistFigure.jsx';
import RankingBoard from './RankingBoard.jsx';

/**
 * Le plateau d'une sélection sur vidéo.
 *
 * ─── En quoi il diffère du plateau ordinaire ────────────────────────────────
 *
 * Ailleurs, l'organisateur compose la liste et le joueur la classe. Ici,
 * personne ne sait qui a envoyé une wildcard au moment où l'on pronostique :
 * c'est justement la question. Le joueur pioche donc lui-même dans le
 * référentiel des artistes, et son top se construit au fur et à mesure.
 *
 * Le classement lui-même reste le `RankingBoard` de partout ailleurs : classer
 * des noms est le même geste, et deux interfaces pour la même tâche n'auraient
 * servi personne. Ce composant n'ajoute que la pioche au-dessus.
 *
 * ─── Deux listes qu'il ne faut jamais confondre ─────────────────────────────
 *
 * `category.contenders` est COLLECTIF, et doit le rester : c'est le référentiel
 * des participants. Tout l'aval y pointe — les rangs pronostiqués, le résultat
 * officiel saisi par l'organisateur, le calcul des points, la fiche d'artiste.
 * Deux joueurs qui piochent Alem doivent obtenir LE MÊME participant, sans quoi
 * le résultat officiel n'en récompenserait qu'un.
 *
 * Le PLATEAU d'un joueur est autre chose : c'est la petite liste des noms qu'il
 * a lui-même retenus. Confondre les deux — ce que faisait la version
 * précédente, qui passait le référentiel entier au classement — donnait à
 * chacun la pioche de tous les autres : le joueur 2 ouvrait la page et trouvait
 * les quatre noms du joueur 1 déjà posés dans sa colonne « à placer ». Et comme
 * les artistes déjà au plateau sont retirés des suggestions, il ne pouvait même
 * plus les chercher pour s'en débarrasser.
 *
 * ─── D'où vient le plateau personnel ────────────────────────────────────────
 *
 * De deux sources réunies :
 *
 *   — les participants que ce joueur a CLASSÉS, lus depuis son `order`. C'est
 *     la partie persistante : ses rangs sont enregistrés, donc son plateau se
 *     reconstitue au rechargement sans qu'on ait besoin de le stocker ailleurs.
 *   — ceux qu'il vient de piocher et n'a pas encore placés, tenus ici, le temps
 *     de la session.
 *
 * La colonne « à placer » est un plan de travail, pas une partie du pronostic :
 * un nom qu'on n'a jamais classé ne dit rien de ce qu'on prévoit. Le perdre au
 * rechargement est donc cohérent — et c'est déjà le sort de tout ce qui n'a pas
 * été enregistré sur cette page.
 */
export default function WildcardBoard({ category, phase, order, onChange, locked }) {
    const { t } = useI18n();

    const [artists, setArtists] = useState([]);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    /**
     * Les participants piochés cette session et pas encore classés.
     *
     * Uniquement ceux-là : les autres se déduisent de `order`. Tenir ici une
     * liste complète obligerait à la garder d'accord avec les rangs à chaque
     * glisser-déposer, et deux états qui décrivent la même chose finissent
     * toujours par diverger.
     */
    const [picked, setPicked] = useState([]);

    // Changement de catégorie : le plan de travail ne suit pas.
    useEffect(() => { setPicked([]); setQuery(''); }, [category.id]);

    useEffect(() => {
        api.get('/artists').then(({ artists: list }) => setArtists(list)).catch(() => { });
    }, []);

    /**
     * Le plateau de CE joueur.
     *
     * Une `Map` plutôt qu'une concaténation filtrée : un participant peut être à
     * la fois classé et présent dans la pioche de session — on l'a placé après
     * l'avoir cherché — et il ne doit apparaître qu'une fois.
     *
     * Les classés d'abord, dans l'ordre du référentiel, puis les piochés : c'est
     * ce qui fait qu'un nom fraîchement ajouté arrive en bas de la colonne « à
     * placer » plutôt qu'au milieu.
     */
    const mine = useMemo(() => {
        const all = category.contenders ?? [];
        const map = new Map();
        for (const c of all) if (order.includes(c.id)) map.set(c.id, c);
        for (const c of picked) if (!map.has(c.id)) map.set(c.id, c);
        return [...map.values()];
    }, [category.contenders, order, picked]);

    /**
     * Les artistes déjà sur MON plateau : on ne me les repropose pas.
     *
     * Sur le mien et pas sur celui de tout le monde. Filtrer sur le référentiel
     * collectif rendait introuvable tout artiste qu'un autre joueur avait déjà
     * proposé : le premier à piocher Alem le retirait de la recherche des
     * suivants, qui ne pouvaient plus le mettre dans leur top.
     */
    const engaged = useMemo(() => {
        const ids = new Set();
        for (const c of mine) for (const link of c.artists ?? []) ids.add(link.artist?.id ?? link.artistId);
        return ids;
    }, [mine]);

    /**
     * Les suggestions.
     *
     * Filtrées sur le FORMAT de la catégorie — on ne pioche pas un crew dans une
     * sélection solo — puis sur ce qui est tapé. Bornées à huit : une liste plus
     * longue ne se lit pas, et si le nom cherché n'y est pas, c'est qu'il faut
     * taper une lettre de plus.
     */
    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return artists
            .filter((a) => (a.kinds ?? []).includes(category.kind))
            .filter((a) => !engaged.has(a.id))
            .filter((a) => a.name.toLowerCase().includes(q))
            .slice(0, 8);
    }, [artists, query, engaged, category.kind]);

    async function pick(artist) {
        setBusy(artist.id);
        setError(null);
        try {
            const { contender } = await api.post(`/predictions/categories/${category.id}/pool`, {
                artistId: artist.id,
            });
            // Le participant peut déjà exister — quelqu'un d'autre l'a proposé,
            // et le serveur renvoie alors le même. C'est voulu : le référentiel
            // est commun, seul le plateau est personnel.
            //
            // Et il atterrit dans le plan de travail, pas dans le classement :
            // piocher, ce n'est pas classer. Le pousser d'office dans le top lui
            // donnait la dernière place sans que personne l'ait demandé.
            setPicked((p) => (p.some((c) => c.id === contender.id) ? p : [...p, contender]));
            setQuery('');
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    }

    const places = phase.qualifierCount ?? 0;
    const waiting = mine.length - order.length;

    return (
        <div className="stack" style={{ gap: '0.8rem' }}>
            <div className="panel stack" style={{ gap: '0.5rem' }}>
                <p className="eyebrow" style={{ margin: 0 }}>
                    {t('wc.board.title', { n: places })}
                </p>
                <p className="faint" style={{ margin: 0, fontSize: '0.9rem' }}>
                    {t('wc.board.lede')}
                </p>

                {!locked && (
                    <div className="field" style={{ margin: 0, position: 'relative' }}>
                        <label htmlFor={`wc-${category.id}`}>{t('wc.board.search')}</label>
                        <input
                            id={`wc-${category.id}`}
                            type="text"
                            value={query}
                            autoComplete="off"
                            placeholder={t('wc.board.placeholder')}
                            onChange={(e) => setQuery(e.target.value)}
                        />

                        {query.trim() !== '' && (
                            <div className="panel panel--flush wc-suggest">
                                {suggestions.length === 0 ? (
                                    <p className="empty" style={{ margin: 0, padding: '0.6rem' }}>
                                        {t('wc.board.none')}
                                    </p>
                                ) : (
                                    suggestions.map((a) => (
                                        <button
                                            key={a.id}
                                            className="wc-suggest__item"
                                            disabled={busy === a.id}
                                            onClick={() => pick(a)}
                                        >
                                            <ArtistFigure src={a.imageUrl} name={a.name} size="xs" />
                                            <span>{a.name}</span>
                                            {a.country && <span className="faint">{a.country}</span>}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {error && <p className="notice" style={{ margin: 0 }}>{error}</p>}

                {/* Le second nombre compte ce qui reste à placer, et non plus ce
                    que « la communauté a proposé » : ce total-là parlait d'une
                    liste que le joueur ne voit pas et sur laquelle il n'a aucune
                    prise. */}
                <p className="faint data" style={{ margin: 0, fontSize: '0.82rem' }}>
                    {t('wc.board.count', { picked: order.length, pool: Math.max(0, waiting) })}
                </p>
            </div>

            {/* Le classement, inchangé. La ligne de coupe passe au nombre de
                places : au-dessus, ceux qu'on annonce qualifiés.

                Son `contenders` est le plateau PERSONNEL, ni le référentiel
                collectif — chacun héritait alors de la pioche des autres — ni
                les seuls classés : filtré sur `order`, retirer quelqu'un du top
                le faisait disparaître de la fiche, plus dans le classement, plus
                dans « à placer », et introuvable à la recherche puisqu'il
                comptait comme déjà engagé. Un artiste qu'on a pioché ne doit
                jamais pouvoir sortir de l'écran. */}
            <RankingBoard
                phase={phase}
                contenders={mine}
                order={order}
                onChange={onChange}
                locked={locked}
            />

            {mine.length === 0 && (
                <p className="empty">{t('wc.board.empty')}</p>
            )}
        </div>
    );
}