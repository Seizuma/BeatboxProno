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
 */
export default function WildcardBoard({ category, phase, order, onChange, locked }) {
    const { t } = useI18n();

    const [artists, setArtists] = useState([]);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    // Le plateau visible : ce que ce joueur a déjà pioché, plus ce que d'autres
    // ont proposé avant lui. La liste d'une sélection est collective.
    const [pool, setPool] = useState(category.contenders ?? []);

    useEffect(() => { setPool(category.contenders ?? []); }, [category.contenders]);

    useEffect(() => {
        api.get('/artists').then(({ artists: list }) => setArtists(list)).catch(() => { });
    }, []);

    const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

    // Les artistes déjà au plateau : on ne les repropose pas, sans quoi la
    // recherche suggérerait d'ajouter quelqu'un qui est déjà dans le top.
    const engaged = useMemo(() => {
        const ids = new Set();
        for (const c of pool) for (const link of c.artists ?? []) ids.add(link.artist?.id ?? link.artistId);
        return ids;
    }, [pool]);

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
            // Le participant peut déjà exister — quelqu'un d'autre l'a proposé.
            // On l'ajoute au plateau seulement s'il n'y est pas.
            setPool((p) => (p.some((c) => c.id === contender.id) ? p : [...p, contender]));
            onChange([...order, contender.id]);
            setQuery('');
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    }

    const places = phase.qualifierCount ?? 0;

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

                <p className="faint data" style={{ margin: 0, fontSize: '0.82rem' }}>
                    {t('wc.board.count', { picked: order.length, pool: pool.length })}
                </p>
            </div>

            {/* Le classement, inchangé. La ligne de coupe passe au nombre de
                places : au-dessus, ceux qu'on annonce qualifiés. */}
            <RankingBoard
                phase={phase}
                contenders={pool.filter((c) => order.includes(c.id))}
                order={order}
                onChange={onChange}
                locked={locked}
            />

            {order.length === 0 && (
                <p className="empty">{t('wc.board.empty')}</p>
            )}
        </div>
    );
}