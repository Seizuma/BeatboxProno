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
 * De la POCHE du pronostic : `pool`, une liste d'identifiants enregistrée avec
 * le reste, qui contient tout ce que ce joueur a mis sur son plateau — classés
 * compris.
 *
 * La première version la déduisait des rangs et gardait le reste en mémoire du
 * navigateur. C'était faux dans les deux sens. Un nom cherché mais pas encore
 * placé n'a pas de rang : rafraîchir la page effaçait une recherche de quinze
 * noms, et rien ne prévenait puisque les noms déjà classés, eux, revenaient.
 * Chercher un nom coûte du temps ; le classer n'en coûte aucun. Perdre le
 * travail cher pour conserver le travail gratuit était l'inverse de ce qu'il
 * fallait faire.
 *
 * `order` reste lu en complément, et uniquement en repli : les pronostics
 * déposés avant cette colonne n'ont pas de poche, et leur plateau doit
 * continuer de s'afficher.
 */
export default function WildcardBoard({
    category,
    phase,
    order,
    onChange,
    pool,
    onPool,
    onContender,
    locked,
}) {
    const { t } = useI18n();

    const [artists, setArtists] = useState([]);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    // Changement de catégorie : la recherche en cours ne suit pas.
    useEffect(() => { setQuery(''); }, [category.id]);

    useEffect(() => {
        api.get('/artists').then(({ artists: list }) => setArtists(list)).catch(() => { });
    }, []);

    /**
     * Le plateau de CE joueur.
     *
     * La poche fait foi, et l'ordre des identifiants qu'elle contient est celui
     * dans lequel les noms ont été piochés : la colonne « à placer » garde donc
     * l'ordre d'arrivée, et un nom fraîchement ajouté apparaît en bas plutôt
     * qu'au milieu.
     *
     * `order` complète en repli, pour les pronostics enregistrés avant que la
     * poche existe : leurs classés sont dans les rangs et nulle part ailleurs.
     * Une `Map` plutôt qu'une concaténation filtrée, puisqu'un identifiant peut
     * figurer dans les deux.
     *
     * ─── Le filtre `byId.has` ───────────────────────────────────────────────
     *
     * Un identifiant que le référentiel ne connaît pas est écarté, et c'est
     * volontaire : la poche d'un vieux pronostic peut citer un participant que
     * l'organisateur a retiré depuis, et l'afficher sans nom ni artiste ne
     * servirait personne.
     *
     * Mais ce filtre coûtait le nom d'un artiste fraîchement pioché. La page
     * événement charge `/events/:slug` UNE fois au montage ; le participant que
     * le serveur vient de créer n'y figure évidemment pas. Il entrait dans la
     * poche, puis se faisait jeter ici — rien n'apparaissait, aucune erreur, et
     * il ne se montrait qu'au rechargement suivant. D'où l'impression que « la
     * deuxième fois, ça marche ».
     *
     * `pick` remonte donc le participant reçu à la page, qui l'ajoute au
     * référentiel avant que ce calcul ne rejoue.
     */
    const mine = useMemo(() => {
        const byId = new Map((category.contenders ?? []).map((c) => [c.id, c]));
        const map = new Map();
        for (const id of pool ?? []) if (byId.has(id)) map.set(id, byId.get(id));
        for (const id of order) if (!map.has(id) && byId.has(id)) map.set(id, byId.get(id));
        return [...map.values()];
    }, [category.contenders, order, pool]);

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
            // Le référentiel D'ABORD, la poche ensuite. Le participant vient
            // peut-être d'être créé : tant que la page ne le connaît pas, le
            // plateau le filtre et le nom n'apparaît nulle part.
            //
            // L'appel est idempotent côté page — un participant déjà présent
            // n'est pas dupliqué — ce qui couvre le cas où quelqu'un d'autre
            // l'avait proposé avant et où le serveur renvoie le même.
            onContender?.(contender);

            // Le participant peut déjà exister — quelqu'un d'autre l'a proposé,
            // et le serveur renvoie alors le même. C'est voulu : le référentiel
            // est commun, seul le plateau est personnel.
            //
            // Et il atterrit dans la poche, pas dans le classement : piocher,
            // ce n'est pas classer. Le pousser d'office dans le top lui donnait
            // la dernière place sans que personne l'ait demandé.
            onPool(
                (pool ?? []).includes(contender.id) ? (pool ?? []) : [...(pool ?? []), contender.id]
            );
            setQuery('');
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    }

    /**
     * Sortir un participant du plateau.
     *
     * Des deux listes à la fois, et c'est ce qui distingue ce geste du « × » de
     * la colonne classée : celui-là renvoie le nom dans « à placer », celui-ci
     * le fait disparaître. Ne le retirer que de la poche laisserait un classé
     * survivre par le repli sur `order` — il serait revenu tout seul.
     */
    const discard = (id) => {
        onPool((pool ?? []).filter((x) => x !== id));
        if (order.includes(id)) onChange(order.filter((x) => x !== id));
    };

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
                onDiscard={locked ? undefined : discard}
                locked={locked}
            />

            {mine.length === 0 && (
                <p className="empty">{t('wc.board.empty')}</p>
            )}
        </div>
    );
}