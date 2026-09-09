import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Retoucher le format d'une catégorie déjà montée.
 *
 * L'écran de composition d'événement ne sait que créer : une fois la catégorie
 * en place, l'oubli d'une petite finale n'avait plus d'issue que le
 * remplacement complet, qui emporte les pronostics de tout le monde. Ce panneau
 * s'adresse au serveur qui, lui, réconcilie — il ne touche qu'à la différence.
 *
 * L'état de départ se DÉDUIT de ce qui existe plutôt que d'être stocké quelque
 * part : le nombre d'affiches du premier tour donne la taille, la présence d'une
 * affiche SMALL_FINAL donne la petite finale, les phases donnent les paliers de
 * qualification. Deux sources pour la même vérité finissent toujours par
 * diverger.
 */
const SIZES = [
    ['TOP_32', 'Top 32', 32],
    ['TOP_16', 'Top 16', 16],
    ['TOP_8', 'Top 8', 8],
    ['TOP_4', 'Top 4', 4],
    ['TOP_2', 'Finale seule', 2],
];

const MAIN = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];

function readCurrent(category) {
    const bracket = category.phases.find((p) => p.type === 'BRACKET');
    const battles = bracket?.battles ?? [];

    const first = MAIN.find((r) => battles.some((b) => b.round === r));
    const size = first ? battles.filter((b) => b.round === first).length * 2 : 8;
    const format = SIZES.find(([, , n]) => n === size)?.[0] ?? 'TOP_8';

    const wildcard = category.phases.find((p) => p.type === 'WILDCARD');
    const elimination = category.phases.find((p) => p.type === 'ELIMINATION');

    return {
        format,
        smallFinal: battles.some((b) => b.round === 'SMALL_FINAL'),
        wildcard: Boolean(wildcard),
        wildcardCount: wildcard?.qualifierCount ?? null,
        elimination: Boolean(elimination),
        eliminationCount: elimination?.qualifierCount ?? null,
    };
}

export default function CategoryFormat({ category, onDone, run }) {
    const initial = useMemo(() => readCurrent(category), [category]);
    const [spec, setSpec] = useState(initial);
    const [confirm, setConfirm] = useState(null); // l'impact renvoyé en 409
    const [busy, setBusy] = useState(false);

    // La catégorie peut être rechargée sous nos pieds — après enregistrement, par
    // exemple. On repart de ce qu'elle dit plutôt que de garder un état périmé.
    useEffect(() => { setSpec(initial); setConfirm(null); }, [initial]);

    const patch = (p) => { setSpec((s) => ({ ...s, ...p })); setConfirm(null); };

    const shapeHasSemi = ['TOP_32', 'TOP_16', 'TOP_8', 'TOP_4'].includes(spec.format);
    const changed = JSON.stringify(spec) !== JSON.stringify(initial);

    async function save(force = false) {
        setBusy(true);
        try {
            const body = { ...spec, force };
            const out = await api.put(`/admin/categories/${category.id}/format`, body);
            setConfirm(null);
            await onDone();
            await run(async () => {
                const bits = [];
                if (out.impact.battlesAdded) bits.push(`${out.impact.battlesAdded} affiche(s) ajoutée(s)`);
                if (out.impact.battlesRemoved) bits.push(`${out.impact.battlesRemoved} supprimée(s)`);
                if (out.backfilled) bits.push(`${out.backfilled} petite(s) finale(s) composée(s) chez les joueurs`);
                return `${category.name} : ${bits.length ? bits.join(', ') : 'aucun changement'}.`;
            });
        } catch (e) {
            // Le serveur refuse une manœuvre destructrice tant qu'elle n'est pas
            // confirmée, et dit ce qu'elle coûterait. On montre le compte plutôt que
            // le message brut : c'est sur ces chiffres que la décision se prend.
            if (e.status === 409 && e.body?.impact) setConfirm(e.body.impact);
            else await run(async () => { throw e; });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="panel stack" style={{ gap: '0.7rem', borderColor: 'var(--m)' }}>
            <h4 style={{ margin: 0 }}>Format du tableau</h4>

            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                {SIZES.map(([id, label]) => (
                    <button
                        key={id}
                        className={`btn btn--small${spec.format === id ? ' btn--primary' : ''}`}
                        onClick={() => patch({ format: id })}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                    className={`btn btn--small${spec.smallFinal ? ' btn--primary' : ''}`}
                    disabled={!shapeHasSemi}
                    onClick={() => patch({ smallFinal: !spec.smallFinal })}
                    title={shapeHasSemi ? undefined : 'Sans demi-finales, il n\u2019y a pas de perdants à opposer.'}
                >
                    Petite finale (3e place)
                </button>

                <button
                    className={`btn btn--small${spec.wildcard ? ' btn--primary' : ''}`}
                    onClick={() => patch({ wildcard: !spec.wildcard })}
                >
                    Wildcards
                </button>
                {spec.wildcard && (
                    <input
                        type="number" min="2" max="200" style={{ width: '6rem' }}
                        aria-label="Nombre de qualifiés en wildcards"
                        value={spec.wildcardCount ?? ''}
                        placeholder="qualifiés"
                        onChange={(e) => patch({ wildcardCount: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                )}

                <button
                    className={`btn btn--small${spec.elimination ? ' btn--primary' : ''}`}
                    onClick={() => patch({ elimination: !spec.elimination })}
                >
                    Éliminations
                </button>
                {spec.elimination && (
                    <input
                        type="number" min="2" max="200" style={{ width: '6rem' }}
                        aria-label="Nombre de qualifiés en éliminations"
                        value={spec.eliminationCount ?? ''}
                        placeholder="qualifiés"
                        onChange={(e) => patch({ eliminationCount: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                )}
            </div>

            {confirm && (
                <div className="notice" style={{ borderColor: 'var(--r)' }}>
                    <p style={{ margin: 0 }}>
                        Ce changement supprimerait <strong>{confirm.battlesRemoved}</strong> affiche(s),
                        dont <strong>{confirm.playedRemoved}</strong> déjà jouée(s), et{' '}
                        <strong>{confirm.predictedBattlesLost}</strong> choix de pronostiqueurs.
                        {confirm.phasesRemoved.map((p) => (
                            <span key={p.id}>
                                {' '}La phase « {p.name} » part avec {p.predictedRanks} classement(s) pronostiqué(s).
                            </span>
                        ))}
                    </p>
                    <div className="row" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button className="btn btn--small btn--danger" disabled={busy} onClick={() => save(true)}>
                            Supprimer quand même
                        </button>
                        <button className="btn btn--small btn--ghost" onClick={() => setConfirm(null)}>
                            Annuler
                        </button>
                    </div>
                </div>
            )}

            <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                <button
                    className="btn btn--small btn--primary"
                    disabled={!changed || busy}
                    onClick={() => save(false)}
                >
                    Appliquer le format
                </button>
                {changed && (
                    <button className="btn btn--small btn--ghost" onClick={() => { setSpec(initial); setConfirm(null); }}>
                        Annuler les modifications
                    </button>
                )}
            </div>

            <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                Seule la différence est appliquée : ajouter une petite finale crée une affiche
                et ne touche à rien d'autre. Les pronostics déjà déposés gardent leurs choix,
                et leur petite finale est composée à partir de leurs propres demies — sans
                vainqueur désigné, ce choix reste le leur.
            </p>
        </div>
    );
}