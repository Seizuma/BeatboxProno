import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import PredictionView from './PredictionView.jsx';
import MenuButton from './MenuButton.jsx';
import ConfirmDelete from './ConfirmDelete.jsx';

/**
 * La date d'un pronostic, à la minute.
 *
 * ─── Pourquoi `createdAt` et pas `updatedAt` ────────────────────────────────
 *
 * `updatedAt` bouge à chaque recalcul de points : un settlement d'événement
 * réécrit mille lignes d'un coup, et la colonne afficherait la date du
 * settlement pour des pronostics déposés six mois plus tôt. C'est la question
 * « quand ce pronostic a-t-il été fait ? » qu'on vient poser ici.
 *
 * ─── Pourquoi pas la seconde ────────────────────────────────────────────────
 *
 * On cherche à situer un dépôt par rapport à une date butoir ou à un incident,
 * pas à départager deux clics. La seconde ne ferait qu'allonger la colonne.
 */
function stamp(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const ROUNDS = [
    ['', 'Tous les tours'],
    ['ROUND_OF_32', 'Seizièmes'],
    ['ROUND_OF_16', 'Huitièmes'],
    ['QUARTER', 'Quarts'],
    ['SEMI', 'Demies'],
    ['SMALL_FINAL', 'Petite finale'],
    ['FINAL', 'Finale'],
    ['LEGACY', 'Legacy'],
];

/**
 * Les façons de désigner une place, et ce qu'elles valent en bornes.
 *
 * ─── Pourquoi ce n'est plus « min » et « max » ──────────────────────────────
 *
 * Le serveur raisonne en bornes, et l'écran les recopiait telles quelles. Mais
 * la question qu'on se pose n'est presque jamais « entre 11 et 11 » : c'est
 * « qui l'a mis onzième ». Il fallait donc traduire soi-même une question
 * simple en deux champs, et les remplir avec la même valeur — un geste qui
 * s'explique par l'implémentation et par rien d'autre.
 *
 * Les bornes sont calculées au moment de chercher. Le serveur ne change pas.
 */
const RANK_MODES = [
    ['exact', 'exactement', (a) => ({ rankMin: a, rankMax: a })],
    ['top', 'dans le top', (a) => ({ rankMax: a })],
    ['beyond', 'au-delà de', (a) => ({ rankMin: a })],
    ['between', 'entre', (a, b) => ({ rankMin: a, rankMax: b })],
];

const EMPTY = {
    event: '',
    categoryId: '',
    phaseId: '',
    subject: '',
    opponent: '',
    player: '',
    round: '',
    rankMode: 'exact',
    rankA: '',
    rankB: '',
    winner: false,
    drafts: false,
};

/**
 * Retrouver un pronostic à partir de ce qu'on en sait.
 *
 * ─── Le besoin ───────────────────────────────────────────────────────────────
 *
 * Un joueur signale un incident, conteste un score, demande pourquoi tel
 * pronostic vaut tant. Répondre demandait d'ouvrir une console psql et
 * d'écrire une jointure à cinq tables. Cet écran pose les mêmes questions avec
 * des filtres qui se cumulent, et chaque résultat s'ouvre sur la fiche
 * complète.
 *
 * ─── Les brouillons ne sortent pas par défaut ────────────────────────────────
 *
 * Chacun peut garder dix brouillons par catégorie. Ils ne sont publics nulle
 * part, et leurs auteurs ne s'attendent pas à ce qu'on les lise — c'est une
 * différence de nature avec un pronostic déposé, public par construction. La
 * case existe, elle est décochée : le défaut protège, l'option permet.
 *
 * ─── Pourquoi la recherche ne part pas toute seule ───────────────────────────
 *
 * Aucun déclenchement à la frappe. Une requête par lettre tapée sur une table
 * de pronostics n'est pas un détail de confort : c'est une jointure lourde
 * relancée dix fois par mot. Le bouton rend le coût visible, et personne ne
 * cherche par accident.
 */
export default function AdminSearch() {
    const [events, setEvents] = useState([]);
    const [detail, setDetail] = useState(null);
    const [filters, setFilters] = useState(EMPTY);
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [reading, setReading] = useState(null);
    // Le pronostic dont on prépare la suppression. Rien ne part au serveur tant
    // que le bilan n'a pas été relu : la route refuse de toute façon sans
    // `confirm`, l'interface et l'API tiennent la même ligne.
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        api.get('/events').then(({ events }) => setEvents(events)).catch(() => { });
    }, []);

    // Les catégories et les phases dépendent de l'événement : on ne les charge
    // qu'une fois celui-ci choisi, plutôt que de tout garder en mémoire.
    useEffect(() => {
        if (!filters.event) {
            setDetail(null);
            return;
        }
        api.get(`/events/${filters.event}`).then(({ event }) => setDetail(event)).catch(() => { });
    }, [filters.event]);

    const categories = detail?.categories ?? [];
    const phases = useMemo(
        () => categories.find((c) => c.id === filters.categoryId)?.phases ?? [],
        [categories, filters.categoryId]
    );

    const set = (patch) =>
        setFilters((f) => {
            const next = { ...f, ...patch };
            // Changer d'événement invalide la catégorie et la phase choisies, qui
            // appartenaient au précédent : les garder produirait une requête qui ne
            // peut rien trouver, sans que rien ne l'explique.
            if (patch.event !== undefined) return { ...next, categoryId: '', phaseId: '' };
            if (patch.categoryId !== undefined) return { ...next, phaseId: '' };
            // Effacer l'artiste vide ce qui en dépend. Ces critères ne sont pas
            // seulement grisés : côté serveur ils ne s'appliquent pas sans lui,
            // et les laisser renseignés ferait mentir le compte de filtres
            // actifs — on croirait chercher sur quatre critères alors qu'un seul
            // opère.
            if (patch.subject !== undefined && patch.subject.trim() === '') {
                return { ...next, opponent: '', winner: false, rankA: '', rankB: '' };
            }
            return next;
        });

    const search = async () => {
        setBusy(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(filters)) {
                // Les trois champs de place sont traduits juste après : envoyés
                // tels quels, le serveur ne saurait pas quoi en faire.
                if (['rankMode', 'rankA', 'rankB'].includes(key)) continue;
                if (value === '' || value === false) continue;
                params.set(key, value === true ? '1' : String(value));
            }

            for (const [, , bounds] of RANK_MODES.filter(([id]) => id === filters.rankMode)) {
                const a = filters.rankA === '' ? null : Number(filters.rankA);
                const b = filters.rankB === '' ? null : Number(filters.rankB);
                if (a == null) break;
                for (const [key, value] of Object.entries(bounds(a, b))) {
                    if (value != null) params.set(key, String(value));
                }
            }
            setData(await api.get(`/admin/search/predictions?${params}`));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    /**
     * Toutes les conditions du serveur, sauf le tour, passent par l'artiste.
     *
     * `rankMin`/`rankMax` vivent dans une branche gardée par `subjectIds` ;
     * « face à » compare `subjectIds` à `opponentIds` ; « donné vainqueur » est
     * explicitement conditionné. Sans artiste, ces trois filtres ne font donc
     * RIEN — silencieusement, ce qui est le pire des cas : on croit avoir
     * cherché « les pronostics qui placent quelqu'un onzième » et on obtient
     * tout l'événement.
     *
     * L'écran rend cette dépendance visible plutôt que de la laisser découvrir.
     */
    const hasSubject = filters.subject.trim() !== '';

    // `rankMode` a toujours une valeur : le compter comme un filtre actif
    // afficherait « 1 filtre » sur un formulaire vierge.
    const active = Object.entries(filters).filter(
        ([k, v]) => k !== 'rankMode' && v !== '' && v !== false
    ).length;


    return (
        <div className="stack">
            {/* Un vrai <form> : on tape un nom d'artiste et on appuie sur Entrée.
                Le bouton restait le seul moyen de lancer la recherche, ce qui est
                contre-intuitif dans un formulaire où l'on saisit du texte. */}
            <form
                className="panel stack"
                style={{ gap: '0.8rem' }}
                onSubmit={(e) => { e.preventDefault(); search(); }}
            >
                <div className="spread">
                    <h2 style={{ margin: 0 }}>Recherche</h2>
                    {/* Le compte des filtres actifs était calculé sans jamais être
                        montré. C'est pourtant lui qui explique une recherche qui ne
                        rend rien : un critère oublié de la fois précédente. */}
                    {active > 0 && <span className="tag">{active} filtre{active > 1 ? 's' : ''}</span>}
                </div>
                <p className="faint" style={{ margin: 0, fontSize: '0.88rem' }}>
                    Tous les filtres sont facultatifs et se cumulent. Laissés vides, ils n'excluent rien.
                </p>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.6rem' }}>
                    <div className="field">
                        <label htmlFor="s-event">Événement</label>
                        <select id="s-event" value={filters.event} onChange={(e) => set({ event: e.target.value })}>
                            <option value="">Tous</option>
                            {events.map((ev) => (
                                <option key={ev.slug} value={ev.slug}>{ev.name} {ev.year}</option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label htmlFor="s-cat">Catégorie</label>
                        <select
                            id="s-cat"
                            value={filters.categoryId}
                            disabled={!detail}
                            onChange={(e) => set({ categoryId: e.target.value })}
                        >
                            <option value="">Toutes</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label htmlFor="s-phase">Phase</label>
                        <select
                            id="s-phase"
                            value={filters.phaseId}
                            disabled={!filters.categoryId}
                            onChange={(e) => set({ phaseId: e.target.value })}
                        >
                            <option value="">Toutes</option>
                            {phases.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Le tour est le SEUL critère d'affiche qui vaille seul : le
                        serveur en fait une condition à part quand ni vainqueur ni
                        adversaire ne sont demandés. Sa place est donc ici, avec le
                        périmètre, et non dans le bloc qui dépend d'un artiste. */}
                    <div className="field">
                        <label htmlFor="s-round">Tour</label>
                        <select id="s-round" value={filters.round} onChange={(e) => set({ round: e.target.value })}>
                            {ROUNDS.map(([id, label]) => (
                                <option key={id} value={id}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label htmlFor="s-player">Joueur</label>
                        <input
                            id="s-player"
                            value={filters.player}
                            placeholder="pseudo ou nom affiché"
                            onChange={(e) => set({ player: e.target.value })}
                        />
                    </div>
                </div>

                {/* ─── Ce qu'on cherche, à propos d'un artiste ───────────────
                    Le regroupement n'est pas cosmétique : côté serveur, la place,
                    « face à » et « donné vainqueur » vivent tous dans des branches
                    gardées par l'artiste. Sans lui, ces trois filtres ne font rien
                    — silencieusement. Les poser à côté des autres laissait croire
                    qu'ils s'utilisaient seuls. */}
                <fieldset
                    style={{ border: 'var(--frame)', padding: '0.7rem 0.8rem', margin: 0 }}
                >
                    <legend className="eyebrow" style={{ padding: '0 0.4rem' }}>
                        À propos d'un artiste
                    </legend>

                    <div className="stack" style={{ gap: '0.6rem' }}>
                        <div className="field" style={{ margin: 0, maxWidth: '22rem' }}>
                            <label htmlFor="s-subject">Artiste ou duo</label>
                            <input
                                id="s-subject"
                                value={filters.subject}
                                placeholder="D-low, UNITEAM…"
                                onChange={(e) => set({ subject: e.target.value })}
                            />
                        </div>

                        {!hasSubject && (
                            <p className="faint" style={{ margin: 0, fontSize: '0.85rem' }}>
                                Renseignez un nom pour activer les critères ci-dessous : ils portent tous
                                sur cet artiste.
                            </p>
                        )}

                        <div
                            className="row"
                            style={{
                                gap: '0.6rem',
                                alignItems: 'flex-end',
                                flexWrap: 'wrap',
                                opacity: hasSubject ? 1 : 0.45,
                            }}
                        >
                            {/* La place, en une seule cellule. Deux champs « min » et
                                « max » obligeaient à écrire 11 et 11 pour demander
                                « onzième » — une traduction du vocabulaire du serveur
                                que l'utilisateur n'a pas à faire. */}
                            <div className="field" style={{ margin: 0 }}>
                                <label htmlFor="s-rank-mode">Placé</label>
                                <select
                                    id="s-rank-mode"
                                    disabled={!hasSubject}
                                    value={filters.rankMode}
                                    onChange={(e) => set({ rankMode: e.target.value, rankB: '' })}
                                >
                                    {RANK_MODES.map(([id, label]) => (
                                        <option key={id} value={id}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field" style={{ margin: 0 }}>
                                <label htmlFor="s-rank-a">
                                    {filters.rankMode === 'top' ? 'des' : 'place'}
                                </label>
                                <input
                                    id="s-rank-a"
                                    type="number"
                                    min="1"
                                    style={{ width: '5.5rem' }}
                                    disabled={!hasSubject}
                                    value={filters.rankA}
                                    onChange={(e) => set({ rankA: e.target.value })}
                                />
                            </div>

                            {filters.rankMode === 'between' && (
                                <div className="field" style={{ margin: 0 }}>
                                    <label htmlFor="s-rank-b">et</label>
                                    <input
                                        id="s-rank-b"
                                        type="number"
                                        min="1"
                                        style={{ width: '5.5rem' }}
                                        disabled={!hasSubject}
                                        value={filters.rankB}
                                        onChange={(e) => set({ rankB: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="field" style={{ margin: 0, flex: '1 1 14rem' }}>
                                <label htmlFor="s-opponent">Face à</label>
                                <input
                                    id="s-opponent"
                                    disabled={!hasSubject}
                                    value={filters.opponent}
                                    placeholder="l'autre camp de l'affiche"
                                    onChange={(e) => set({ opponent: e.target.value })}
                                />
                            </div>

                            <label
                                className="row"
                                style={{ gap: '0.4rem', alignItems: 'center', paddingBottom: '0.35rem' }}
                            >
                                <input
                                    type="checkbox"
                                    disabled={!hasSubject}
                                    checked={filters.winner}
                                    onChange={(e) => set({ winner: e.target.checked })}
                                />
                                Donné vainqueur
                            </label>
                        </div>
                    </div>
                </fieldset>

                <div className="row" style={{ gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Décochée par défaut, et le libellé dit pourquoi : un brouillon
              n'est publié nulle part, son auteur ne s'attend pas à ce qu'on le
              lise. */}
                    <label className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            checked={filters.drafts}
                            onChange={(e) => set({ drafts: e.target.checked })}
                        />
                        Inclure les brouillons (non publics)
                    </label>

                    <span className="row" style={{ gap: '0.5rem', marginLeft: 'auto' }}>
                        {active > 0 && (
                            <button
                                className="btn btn--ghost"
                                type="button"
                                onClick={() => { setFilters(EMPTY); setData(null); }}
                            >
                                Tout effacer
                            </button>
                        )}
                        <button className="btn btn--primary" type="submit" disabled={busy}>
                            {busy ? 'Recherche…' : 'Chercher'}
                        </button>
                    </span>
                </div>
            </form>

            {error && <p className="notice">{error}</p>}

            {data && (
                <section className="stack">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <h2 style={{ margin: 0 }}>
                            {data.total} résultat{data.total > 1 ? 's' : ''}
                        </h2>
                        {data.capped && (
                            <span className="faint data" style={{ fontSize: '0.8rem' }}>
                                200 premiers affichés — affinez les filtres
                            </span>
                        )}
                    </div>

                    {data.rows.length === 0 ? (
                        <p className="empty">Aucun pronostic ne correspond.</p>
                    ) : (
                        <div className="panel panel--flush">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Joueur</th>
                                        <th>Compétition</th>
                                        <th>Date</th>
                                        {/* La justification n'apparaît que
                                            lorsqu'elle a quelque chose à dire :
                                            elle ne se remplit que sur une
                                            recherche par artiste. Une colonne
                                            vide en permanence, c'est une
                                            colonne qu'on finit par croire
                                            cassée. */}
                                        {data.explains && <th>Ce qui correspond</th>}
                                        <th className="num">Points</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((r) => (
                                        <tr key={r.id}>
                                            <td>
                                                <span className="stat-row">
                                                    {r.user.avatarUrl && <img className="avatar" src={r.user.avatarUrl} alt="" />}
                                                    <span>
                                                        {r.user.globalName ?? r.user.username}
                                                        {!r.submitted && (
                                                            <span className="faint data" style={{ display: 'block', fontSize: '0.72rem' }}>
                                                                brouillon{r.label ? ` · ${r.label}` : ''}
                                                            </span>
                                                        )}
                                                    </span>
                                                </span>
                                            </td>

                                            <td className="muted data" style={{ fontSize: '0.8rem' }}>
                                                {r.event.name} {r.event.year}
                                                <span style={{ display: 'block' }}>{r.category.name}</span>
                                            </td>

                                            <td className="muted data" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                {stamp(r.createdAt)}
                                            </td>

                                            {/* La justification de chaque ligne. Sans elle, il
                          faudrait ouvrir chaque fiche pour comprendre pourquoi
                          elle est là. */}
                                            {data.explains && (
                                                <td className="data" style={{ fontSize: '0.8rem' }}>
                                                    {r.ranks.map((k, i) => (
                                                        <span key={`r${i}`} style={{ display: 'block' }}>
                                                            <span style={{ color: 'var(--y)' }}>{k.rank}</span> {k.name}
                                                            {k.phase && <span className="faint"> · {k.phase}</span>}
                                                        </span>
                                                    ))}
                                                    {r.battles.map((b, i) => (
                                                        <span key={`b${i}`} style={{ display: 'block' }}>
                                                            {b.a} vs {b.b}
                                                            {b.winner && <span style={{ color: 'var(--ok)' }}> ▸ {b.winner}</span>}
                                                            {b.score && <span className="faint"> {b.score}</span>}
                                                        </span>
                                                    ))}
                                                    {r.ranks.length === 0 && r.battles.length === 0 && (
                                                        <span className="faint">—</span>
                                                    )}
                                                </td>
                                            )}

                                            <td className="num">{r.scored ? r.points : <span className="faint">—</span>}</td>

                                            <td className="num">
                                                <span className="row" style={{ gap: '0.3rem', justifyContent: 'flex-end' }}>
                                                    <button className="btn btn--small" onClick={() => setReading(r.id)}>
                                                        Ouvrir
                                                    </button>

                                                    {/* La suppression dans un menu, pas en bouton
                                                        permanent. C'est la seule action destructrice
                                                        d'un écran qu'on parcourt : posée à côté de
                                                        « Ouvrir », elle se clique un jour par erreur
                                                        sur la mauvaise ligne. */}
                                                    <MenuButton
                                                        label={`Actions sur le pronostic de ${r.user.username}`}
                                                        items={[
                                                            {
                                                                label: 'Supprimer ce pronostic',
                                                                danger: true,
                                                                onClick: () => setDeleting(r.id),
                                                            },
                                                        ]}
                                                    />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {reading && <PredictionView predictionId={reading} onClose={() => setReading(null)} />}

            {deleting && (
                <ConfirmDelete
                    kind="prediction"
                    id={deleting}
                    onCancel={() => setDeleting(null)}
                    onConfirmed={() => {
                        setDeleting(null);
                        // La fiche ouverte pointerait sur un pronostic qui n'existe
                        // plus : on la referme avant de relancer la recherche.
                        setReading(null);
                        search();
                    }}
                />
            )}
        </div>
    );
}