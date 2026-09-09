import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { isWildcardCategory, MIN_PLACES, MAX_PLACES, clampPlaces } from '../lib/wildcard.js';

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
    // L'aiguillage tient sur la STRUCTURE et non sur un drapeau enregistré :
    // une phase unique de type WILDCARD, et c'est une sélection. Un drapeau
    // peut mentir après qu'on a retouché le format, la structure non.
    if (isWildcardCategory(category)) {
        return <WildcardSettings category={category} onDone={onDone} run={run} />;
    }
    return <BracketFormat category={category} onDone={onDone} run={run} />;
}

/**
 * Les réglages d'une sélection sur vidéo.
 *
 * ─── Pourquoi ce panneau existe ─────────────────────────────────────────────
 *
 * Une sélection n'a pas de tableau : ni taille, ni petite finale, ni palier de
 * qualification. Le formulaire de tableau lui était pourtant servi tel quel, et
 * il mentait de bout en bout — « Top 8 » présélectionné alors qu'aucun tableau
 * n'existe, deux paliers proposés, une petite finale à cocher. Cliquer sur
 * « Appliquer » répondait 400 : la route refuse une catégorie sans tableau.
 *
 * Deux nombres suffisent à décrire une sélection, et ils se lisent ENSEMBLE :
 * vingt choix pour huit places décrit une règle, chacun pris à part n'en décrit
 * aucune. D'où un seul panneau et un seul bouton.
 */
function WildcardSettings({ category, onDone, run }) {
    const phase = category.phases[0];
    const places = phase?.qualifierCount ?? null;
    const cap = phase?.maxPicks ?? null;

    const [form, setForm] = useState({ places: places ?? '', cap: cap ?? '' });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setForm({ places: places ?? '', cap: cap ?? '' });
    }, [places, cap]);

    const nextPlaces = form.places === '' ? null : clampPlaces(Number(form.places));
    const nextCap = form.cap === '' ? null : Math.min(MAX_PLACES, Math.max(1, Number(form.cap)));
    const changed = nextPlaces !== places || nextCap !== cap;

    // Un plafond sous le nombre de places rendrait la compète injouable : on ne
    // peut pas désigner huit qualifiés en ne retenant que cinq noms.
    const tooLow = nextPlaces !== null && nextCap !== null && nextCap < nextPlaces;

    async function save() {
        setBusy(true);
        await run(async () => {
            await api.patch(`/admin/phases/${phase.id}/qualifiers`, {
                qualifierCount: nextPlaces,
                maxPicks: nextCap,
            });
            await onDone();
            return nextCap
                ? `${category.name} : ${nextPlaces} place(s), ${nextCap} choix au maximum.`
                : `${category.name} : ${nextPlaces} place(s), pioche libre.`;
        });
        setBusy(false);
    }

    return (
        <div className="panel stack" style={{ gap: '0.7rem', borderColor: 'var(--m)' }}>
            <h4 style={{ margin: 0 }}>Réglages de la sélection</h4>

            <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="field" style={{ margin: 0 }}>
                    <label htmlFor={`wc-places-${category.id}`}>Places qualificatives</label>
                    <input
                        id={`wc-places-${category.id}`}
                        type="number"
                        min={MIN_PLACES}
                        max={MAX_PLACES}
                        style={{ width: '6rem' }}
                        value={form.places}
                        onChange={(e) => setForm({ ...form, places: e.target.value })}
                    />
                </div>

                <div className="field" style={{ margin: 0 }}>
                    <label htmlFor={`wc-cap-${category.id}`}>Choix maximum</label>
                    <input
                        id={`wc-cap-${category.id}`}
                        type="number"
                        min={1}
                        max={MAX_PLACES}
                        style={{ width: '6rem' }}
                        value={form.cap}
                        placeholder="illimité"
                        onChange={(e) => setForm({ ...form, cap: e.target.value })}
                    />
                </div>

                <button
                    className="btn btn--small btn--primary"
                    disabled={!changed || tooLow || busy}
                    onClick={save}
                >
                    {busy ? 'En cours…' : 'Appliquer'}
                </button>

                {changed && (
                    <button
                        className="btn btn--small btn--ghost"
                        onClick={() => setForm({ places: places ?? '', cap: cap ?? '' })}
                    >
                        Annuler
                    </button>
                )}
            </div>

            {tooLow && (
                <p className="notice" style={{ margin: 0 }}>
                    Un plafond de {nextCap} choix pour {nextPlaces} places rend la sélection injouable :
                    personne ne pourrait désigner tous les qualifiés.
                </p>
            )}

            <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                Le plafond limite le nombre de noms qu'un joueur peut retenir. Sans lui, la stratégie
                gagnante est de tout prendre : chaque nom ajouté ne peut que rapporter, jamais coûter, et
                celui qui verse tous les inscrits ramasse mécaniquement toutes les bonnes réponses.
                Laissé vide, la pioche reste libre.
            </p>

            <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                Déplacer les places recalcule qui est marqué qualifié dans le classement déjà saisi et
                rescore tous les pronostics déposés — les points de tout le monde bougent. Baisser le
                plafond ne touche pas aux pronostics déjà enregistrés : ils gardent leurs noms jusqu'au
                prochain enregistrement de leur auteur.
            </p>
        </div>
    );
}

function BracketFormat({ category, onDone, run }) {
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