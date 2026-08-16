import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Le tirage du premier tour d'un tableau.
 *
 * 1-8, 2-7, 3-6, 4-5 est le tableau classique, mais rien n'oblige une compète à
 * le suivre : GBB a déjà opposé les moitiés, et une catégorie Crew peut faire
 * autrement. Cet écran laisse choisir un modèle courant ou composer affiche par
 * affiche.
 *
 * Les rangs sont ceux de la qualification, pas des identifiants : « 3 » veut
 * dire « le troisième du classement d'éliminations », qui que ce soit. Le
 * tirage survit donc au classement, et se règle avant même de le connaître.
 */
export default function SeedingEditor({ phase, onDone, run }) {
    const [state, setState] = useState(null);
    const [pairs, setPairs] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setError(null);
        api
            .get(`/admin/phases/${phase.id}/seeding`)
            .then((data) => {
                setState(data);
                setPairs(data.seedPairs ?? data.patterns.standard);
            })
            .catch((e) => setError(e.message));
    }, [phase.id]);

    if (error) return <p className="notice">{error}</p>;
    if (!state) return <p className="faint">Lecture du tableau…</p>;
    if (!state.battles) {
        return <p className="notice">Ce tableau n'a pas encore d'affiches : créez-les d'abord.</p>;
    }

    const size = state.size;

    /** Les rangs utilisés plus d'une fois, et ceux qui manquent à l'appel. */
    const used = pairs.flat().filter((n) => n != null);
    const duplicates = used.filter((n, i) => used.indexOf(n) !== i);
    const missing = Array.from({ length: size }, (_, i) => i + 1).filter((n) => !used.includes(n));
    const valid = duplicates.length === 0;

    const setSeed = (slot, side, value) => {
        const n = value === '' ? null : Number(value);
        setPairs(pairs.map((p, i) => (i === slot ? (side === 0 ? [n, p[1]] : [p[0], n]) : p)));
    };

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    const save = (payload, note) =>
        run(async () => {
            const res = await api.put(`/admin/phases/${phase.id}/seeding`, payload);
            setPairs(res.phase.seedPairs ?? state.patterns.standard);
            await onDone();
            const { predictions, battles } = res.converted;
            return (
                `${note} ${predictions} pronostic${predictions > 1 ? 's' : ''} reconverti${predictions > 1 ? 's' : ''}` +
                ` (${battles} affiche${battles > 1 ? 's' : ''})` +
                (res.rescored ? ', points recalculés.' : '.')
            );
        });

    return (
        <div className="stack" style={{ gap: '0.8rem' }}>
            <div className="spread">
                <div>
                    <p className="eyebrow" style={{ margin: 0 }}>Tirage du premier tour</p>
                    <p className="faint" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                        {state.battles} affiches · {size} qualifiés · rangs de la qualification
                    </p>
                </div>
                <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                        ['standard', 'Classique 1-8'],
                        ['halves', 'Moitiés 1-5'],
                        ['adjacent', 'Voisins 1-2'],
                    ].map(([name, label]) => (
                        <button
                            key={name}
                            className={`btn btn--small${same(pairs, state.patterns[name]) ? ' btn--primary' : ''}`}
                            onClick={() => setPairs(state.patterns[name])}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Le changement est lourd de conséquences : il se dit avant, pas
                après. */}
            <p className="notice" style={{ borderColor: 'var(--y)', color: 'var(--y)', margin: 0 }}>
                Changer le tirage reconvertit tous les pronostics de la catégorie. Les vainqueurs
                désignés sur une affiche qui disparaît sont perdus ; les autres survivent.
            </p>

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr>
                            <th>Affiche</th>
                            <th className="num">Rang A</th>
                            <th className="num">Rang B</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pairs.map((pair, slot) => (
                            <tr key={slot}>
                                <td className="muted">{slot + 1}</td>
                                {[0, 1].map((side) => (
                                    <td className="num" key={side}>
                                        <select
                                            value={pair[side] ?? ''}
                                            onChange={(e) => setSeed(slot, side, e.target.value)}
                                            style={
                                                duplicates.includes(pair[side])
                                                    ? { borderColor: 'var(--r)', color: 'var(--r)' }
                                                    : undefined
                                            }
                                        >
                                            <option value="">— bye —</option>
                                            {Array.from({ length: size }, (_, i) => i + 1).map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {duplicates.length > 0 && (
                <p className="notice">
                    Rang{duplicates.length > 1 ? 's' : ''} en double : {[...new Set(duplicates)].join(', ')}.
                </p>
            )}
            {missing.length > 0 && duplicates.length === 0 && (
                <p className="faint" style={{ margin: 0, fontSize: '0.85rem' }}>
                    Rangs non placés : {missing.join(', ')} — ils ne joueront pas ce tour.
                </p>
            )}

            <div className="row" style={{ gap: '0.5rem' }}>
                <button
                    className="btn btn--small btn--primary"
                    disabled={!valid}
                    onClick={() => save({ seedPairs: pairs }, 'Tirage enregistré.')}
                >
                    Enregistrer le tirage
                </button>
                {/* Revenir au classique, c'est effacer le réglage plutôt que
                    d'enregistrer 1-8, 2-7… : une phase sans tirage explicite
                    suivra automatiquement le classique si le format change. */}
                <button
                    className="btn btn--small btn--ghost"
                    onClick={() => save({ seedPairs: null }, 'Retour au tableau classique.')}
                >
                    Réinitialiser
                </button>
            </div>
        </div>
    );
}