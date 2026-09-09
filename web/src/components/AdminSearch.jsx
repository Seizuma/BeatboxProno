import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import PredictionView from './PredictionView.jsx';
import MenuButton from './MenuButton.jsx';
import ConfirmDelete from './ConfirmDelete.jsx';

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

const EMPTY = {
    event: '',
    categoryId: '',
    phaseId: '',
    subject: '',
    opponent: '',
    player: '',
    round: '',
    rankMin: '',
    rankMax: '',
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
            return next;
        });

    const search = async () => {
        setBusy(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(filters)) {
                if (value === '' || value === false) continue;
                params.set(key, value === true ? '1' : String(value));
            }
            setData(await api.get(`/admin/search/predictions?${params}`));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const active = Object.entries(filters).filter(([, v]) => v !== '' && v !== false).length;

    return (
        <div className="stack">
            <section className="panel stack" style={{ gap: '0.8rem' }}>
                <h2>Recherche</h2>
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

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.6rem' }}>
                    <div className="field">
                        <label htmlFor="s-subject">Artiste ou duo</label>
                        <input
                            id="s-subject"
                            value={filters.subject}
                            placeholder="D-low, UNITEAM…"
                            onChange={(e) => set({ subject: e.target.value })}
                        />
                    </div>

                    <div className="field">
                        <label htmlFor="s-opponent">Face à</label>
                        <input
                            id="s-opponent"
                            value={filters.opponent}
                            placeholder="l'autre camp de l'affiche"
                            onChange={(e) => set({ opponent: e.target.value })}
                        />
                    </div>

                    <div className="field">
                        <label htmlFor="s-round">Tour</label>
                        <select id="s-round" value={filters.round} onChange={(e) => set({ round: e.target.value })}>
                            {ROUNDS.map(([id, label]) => (
                                <option key={id} value={id}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-end' }}>
                        <div className="field" style={{ margin: 0 }}>
                            <label htmlFor="s-min">Place min.</label>
                            <input
                                id="s-min"
                                type="number"
                                min="1"
                                value={filters.rankMin}
                                onChange={(e) => set({ rankMin: e.target.value })}
                            />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                            <label htmlFor="s-max">max.</label>
                            <input
                                id="s-max"
                                type="number"
                                min="1"
                                value={filters.rankMax}
                                onChange={(e) => set({ rankMax: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div className="row" style={{ gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            checked={filters.winner}
                            onChange={(e) => set({ winner: e.target.checked })}
                        />
                        Donné vainqueur
                    </label>

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
                            <button className="btn btn--ghost" onClick={() => { setFilters(EMPTY); setData(null); }}>
                                Tout effacer
                            </button>
                        )}
                        <button className="btn btn--primary" disabled={busy} onClick={search}>
                            {busy ? 'Recherche…' : 'Chercher'}
                        </button>
                    </span>
                </div>
            </section>

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
                                        <th>Ce qui correspond</th>
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

                                            {/* La justification de chaque ligne. Sans elle, il
                          faudrait ouvrir chaque fiche pour comprendre pourquoi
                          elle est là. */}
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