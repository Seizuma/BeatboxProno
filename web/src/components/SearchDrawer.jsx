import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { FramedAvatar, Name } from './Cosmetics.jsx';

/* ---------------------------------------------------------------------------
   La recherche générale

   ─── Pourquoi elle est dans l'en-tête ───────────────────────────────────────

   Le classement filtre déjà par pseudo, et la question « peut-on voir les
   pronostics des autres ? » revenait quand même. Une réponse qui n'existe que
   dans un champ d'une page précise n'est pas une réponse : on ne la trouve que
   si l'on savait déjà qu'elle était là. La loupe est à côté des pavés de
   navigation parce que c'est l'endroit où l'on cherche une recherche.

   ─── Le tiroir plutôt que la fenêtre centrée ────────────────────────────────

   Les autres fenêtres du site s'ouvrent au centre, sur un voile noir : elles
   demandent une décision, et le reste de la page attend. Chercher n'est pas de
   cette nature — on cherche EN LISANT, pour aller voir autre chose. Le tiroir
   se range donc dans la marge droite, que la colonne de 980 px laisse vide sur
   un écran de bureau, et la page reste lisible derrière lui.

   Le voile ne revient que sous 1200 px, quand il n'y a plus de marge et que le
   tiroir passe forcément par-dessus le contenu.
   --------------------------------------------------------------------------- */

/** Deux caractères avant d'interroger le serveur. Même seuil que la route. */
const MIN = 2;

/** Le temps de laisser finir un mot. Une requête par lettre n'apprend rien. */
const DEBOUNCE_MS = 260;

/** Durée du repli. Doit rester d'accord avec `sr-fold` dans app.css. */
const EXIT_MS = 240;

/**
 * La loupe, un caractère par pixel.
 *
 * Même convention que `pixels.js` : le dessin se relit dans l'éditeur, et un
 * diff git montre quel pixel a bougé — ce qu'aucun PNG ne saura faire. Douze
 * sur douze, la plus petite grille où un manche diagonal reste un manche.
 */
const GLASS = [
    '..######....',
    '.##....##...',
    '.#......#...',
    '.#......#...',
    '.#......#...',
    '.#......#...',
    '.##....##...',
    '..########..',
    '.......###..',
    '........###.',
    '.........##.',
    '............',
];

/**
 * La loupe en SVG, un `<rect>` par pixel allumé.
 *
 * `currentColor` et non une couleur en dur : le pavé change de fond au survol
 * et à l'ouverture, et l'icône doit suivre sans qu'on ait trois règles à tenir
 * d'accord. `shape-rendering="crispEdges"` interdit au navigateur de lisser les
 * arêtes — sans lui, un pixel art rendu à une taille non entière devient flou,
 * ce qui est exactement ce que la charte refuse.
 */
export function GlassIcon({ size = 14 }) {
    return (
        <svg
            viewBox={`0 0 ${GLASS[0].length} ${GLASS.length}`}
            width={size}
            height={size}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
        >
            {GLASS.flatMap((row, y) =>
                [...row].map((ch, x) =>
                    ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null
                )
            )}
        </svg>
    );
}

/** L'ordre d'affichage des familles, et la couleur qui désigne chacune. */
const KINDS = ['player', 'artist', 'event', 'group'];

/**
 * La ligne secondaire d'un résultat.
 *
 * Le serveur envoie une donnée, pas une phrase : le compte de membres d'un
 * groupe arrive en nombre et se dit « 3 membres » ou « 3 members » ici, où vit
 * le dictionnaire. Rien à traduire côté API.
 */
function hintOf(row, t) {
    if (row.kind === 'group') {
        return row.members == null
            ? null
            : t(row.members > 1 ? 'search.members' : 'search.member', { n: row.members });
    }
    return row.hint || null;
}

export default function SearchDrawer({ onClose, onReady }) {
    const { t } = useI18n();
    const { user } = useSession();
    const { pathname } = useLocation();
    const panel = useRef(null);
    const input = useRef(null);
    const returnTo = useRef(null);
    const done = useRef(false);

    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [cursor, setCursor] = useState(0);
    const [closing, setClosing] = useState(false);

    /**
     * La fermeture laisse le repli se jouer avant de démonter.
     *
     * Démonter tout de suite ne laisse rien à animer. `done` garantit qu'on ne
     * prévient l'appelant qu'une fois, même si l'on clique trois fois sur la
     * croix ou qu'on tape Échap pendant que ça se replie.
     */
    const close = useCallback(() => {
        if (done.current) return;
        done.current = true;
        setClosing(true);
        setTimeout(onClose, EXIT_MS);
    }, [onClose]);

    // L'en-tête emprunte la fermeture animée : sa loupe referme ce qu'elle a
    // ouvert, avec le même repli que la croix et que le clic à côté.
    useEffect(() => {
        onReady?.(close);
    }, [onReady, close]);

    // Ouvrir un résultat ferme le tiroir : on a trouvé, il n'a plus rien à dire.
    // Sur le changement de chemin plutôt que sur le clic, pour attraper aussi la
    // touche Entrée et le retour arrière du navigateur.
    const openedAt = useRef(pathname);
    useEffect(() => {
        if (pathname !== openedAt.current) close();
    }, [pathname, close]);

    useEffect(() => {
        returnTo.current = document.activeElement;
        // Le champ prend le curseur tout de suite : on a cliqué sur une loupe, on
        // veut taper, pas cliquer une seconde fois.
        input.current?.focus();
        return () => returnTo.current?.focus?.();
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close]);

    // Un clic ailleurs range le tiroir. `mousedown` et non `click` : sur un
    // clic qui commence dans le panneau et finit dehors — une sélection de texte
    // relâchée trop loin — `click` fermerait, ce qui est franchement hostile.
    useEffect(() => {
        const onDown = (e) => {
            if (panel.current && !panel.current.contains(e.target)) close();
        };
        // En capture, sinon un composant qui arrête la propagation nous prive de
        // l'événement et le tiroir ne se ferme plus que par la croix.
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
    }, [close]);

    const term = q.trim();

    useEffect(() => {
        if (term.length < MIN) {
            setRows([]);
            setBusy(false);
            setError(null);
            return undefined;
        }

        setBusy(true);
        // `stale` plutôt qu'un AbortController : une réponse lente arrivée après
        // une frappe plus récente doit être IGNORÉE, pas annulée — l'annulation
        // lève une erreur qu'il faudrait ensuite distinguer d'une vraie panne.
        let stale = false;
        const id = setTimeout(() => {
            api
                .get(`/search?q=${encodeURIComponent(term)}`)
                .then(({ results }) => {
                    if (stale) return;
                    setRows(results ?? []);
                    setError(null);
                    setCursor(0);
                })
                .catch((err) => {
                    if (stale) return;
                    setRows([]);
                    setError(err.message);
                })
                .finally(() => {
                    if (!stale) setBusy(false);
                });
        }, DEBOUNCE_MS);

        return () => {
            stale = true;
            clearTimeout(id);
        };
    }, [term]);

    // Regroupé pour l'affichage, à plat pour le clavier : les flèches traversent
    // les familles sans que l'utilisateur ait à savoir qu'elles existent.
    const grouped = useMemo(() => {
        const byKind = new Map(KINDS.map((k) => [k, []]));
        for (const row of rows) byKind.get(row.kind)?.push(row);
        return KINDS.map((kind) => [kind, byKind.get(kind)]).filter(([, list]) => list.length > 0);
    }, [rows]);

    const flat = useMemo(() => grouped.flatMap(([, list]) => list), [grouped]);

    const onFieldKey = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (flat.length === 0) return;
            setCursor((c) => (c + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length);
            return;
        }
        if (e.key === 'Enter' && flat[cursor]) {
            e.preventDefault();
            // Le lien mis en avant porte l'ancre : on le clique plutôt que de
            // naviguer à la main, pour que Ctrl+Entrée ouvre un onglet comme partout.
            panel.current?.querySelector('.sr__hit[data-active="1"]')?.click();
        }
    };

    return createPortal(
        <div className={`sr${closing ? ' sr--out' : ''}`}>
            <aside
                className="sr__panel"
                role="dialog"
                aria-modal="false"
                aria-label={t('search.title')}
                ref={panel}
            >
                <header className="sr__head">
                    <h2 className="sr__title">{t('search.title')}</h2>
                    <button className="btn btn--small btn--ghost" onClick={close} aria-label={t('common.close')}>
                        ✕
                    </button>
                </header>

                <div className="sr__field">
                    <span className="sr__glass" aria-hidden="true">
                        <GlassIcon size={13} />
                    </span>
                    <input
                        ref={input}
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onFieldKey}
                        placeholder={t('search.placeholder')}
                        aria-label={t('search.placeholder')}
                        autoComplete="off"
                        spellCheck="false"
                    />
                </div>

                <div className="sr__body">
                    {term.length < MIN && <p className="sr__note">{t('search.hint')}</p>}

                    {term.length >= MIN && busy && <p className="sr__note">{t('common.loading')}</p>}

                    {error && <p className="notice">{error}</p>}

                    {term.length >= MIN && !busy && !error && flat.length === 0 && (
                        <p className="sr__note">{t('search.empty', { q: term })}</p>
                    )}

                    {/* Déconnecté, la recherche ne rend ni joueurs ni groupes : leurs
              fiches demandent une session, et les proposer fabriquerait des
              liens qui refusent d'ouvrir. On le DIT, plutôt que de laisser
              croire que le site ne connaît personne. */}
                    {!user && <p className="sr__note">{t('search.signin')}</p>}

                    {grouped.map(([kind, list]) => (
                        <section key={kind} className="sr__group">
                            <p className={`sr__kind sr__kind--${kind}`}>{t(`search.kind.${kind}`)}</p>
                            {list.map((row) => {
                                const index = flat.indexOf(row);
                                return (
                                    <Link
                                        key={`${row.kind}:${row.to}`}
                                        to={row.to}
                                        className="sr__hit"
                                        data-active={index === cursor ? '1' : '0'}
                                        onMouseEnter={() => setCursor(index)}
                                    >
                                        {/* La vignette n'est présente que si elle existe. Un carré
                        vide en tiendrait la place et alignerait des noms sur
                        rien — la liste doit se lire, pas se remplir. */}
                                        {row.avatarUrl &&
                                            (row.kind === 'player' ? (
                                                <FramedAvatar url={row.avatarUrl} frameId={row.frameId} size="xs" />
                                            ) : (
                                                <img className="sr__thumb" src={row.avatarUrl} alt="" />
                                            ))}

                                        <span className="sr__text">
                                            <span className="sr__label">
                                                {row.kind === 'player' ? (
                                                    <Name fxId={row.nameFx}>{row.label}</Name>
                                                ) : (
                                                    row.label
                                                )}
                                            </span>
                                            {/* La ligne de dessous désambiguïse quand deux résultats
                          portent le même nom : le pseudo Discord sous le nom
                          affiché, le pays sous l'artiste, la ville sous la
                          compète, la taille sous le groupe. */}
                                            {hintOf(row, t) && <span className="sr__hint">{hintOf(row, t)}</span>}
                                        </span>

                                        {/* Le statut d'une compète en dit plus que son nom : on ne
                        pronostique pas sur une compète terminée. */}
                                        {row.status && <span className="sr__badge">{t(`status.${row.status}`)}</span>}
                                    </Link>
                                );
                            })}
                        </section>
                    ))}
                </div>
            </aside>
        </div>,
        document.body
    );
}