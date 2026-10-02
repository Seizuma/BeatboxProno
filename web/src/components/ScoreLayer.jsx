import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Le calque des points d'un pronostic.
 *
 * ─── Ce qu'il montre ────────────────────────────────────────────────────────
 *
 * Le total d'un pronostic ne dit pas d'où il vient. « 47 points », c'est un
 * nombre ; « River annoncé premier, il finit quatrième : +2 », c'est une
 * histoire, et c'est elle qu'on vient lire après une compète. Le calque pose
 * sur chaque ligne et chaque affiche ce qui s'est réellement passé, et ce que
 * ça a rapporté.
 *
 * ─── Pourquoi un calque et non une colonne ──────────────────────────────────
 *
 * La fiche montre le pronostic tel qu'il a été fait. Y ajouter des colonnes de
 * résultat la transformerait en tableau de comparaison, qui existe déjà sur la
 * page de l'événement. Ici, on regarde son pronostic ; et quand on veut, on
 * pose le résultat par-dessus — puis on le retire pour revoir ce qu'on avait
 * dit. C'est le mode MIX du télétexte : la page posée sur l'image.
 *
 * ─── D'où viennent les chiffres ─────────────────────────────────────────────
 *
 * Du `breakdown` enregistré au dernier recalcul — le détail exact de
 * `points`, ligne par ligne. Rien n'est recalculé ici : deux calculs du même
 * barème finissent toujours par diverger, et le calque afficherait alors un
 * total que le classement dément.
 *
 * Le résultat officiel (`phase.result`) ne sert qu'à montrer ce qui s'est
 * passé, jamais à compter.
 */

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const pairKey = (a, b) => [a, b].filter(Boolean).sort().join('::');

/**
 * Le rythme du calque. Ces trois nombres sont ceux de `board.css` — la durée
 * de sortie et son décalage par élément — et doivent le rester : c'est d'eux
 * que dépend le moment où l'on démonte.
 *
 * Au-delà de STAGGER_CAP, les éléments partent ensemble : un long classement
 * ne doit pas mettre deux secondes à se poser.
 */
const STAGGER_CAP = 12;
const EXIT_MS = 200;
const EXIT_STAGGER_MS = 14;

/** La durée totale d'une disparition, décalages compris : ce qu'il faut attendre avant de démonter. */
export const SCORE_LAYER_EXIT_MS = EXIT_MS + STAGGER_CAP * EXIT_STAGGER_MS + 40;

/**
 * Indexe le détail des points d'un pronostic, phase par phase.
 *
 * @returns {Map|null}  phaseId → { kind, total, rows | battles, four, official }
 *   `null` quand il n'y a rien à montrer : pronostic pas encore scoré, ou
 *   catégorie hors barème.
 */
export function scoreIndex(prediction) {
    const sections = prediction?.breakdown;
    if (!prediction?.scoredAt || !Array.isArray(sections) || sections.length === 0) return null;

    const phases = new Map((prediction.category?.phases ?? []).map((p) => [p.id, p]));
    const index = new Map();

    const entry = (phaseId) => {
        if (!index.has(phaseId)) {
            const phase = phases.get(phaseId);
            index.set(phaseId, {
                kind: RANKING_TYPES.includes(phase?.type) ? 'ranking' : 'bracket',
                total: 0,
                rows: new Map(),
                battles: new Map(),
                four: null,
                official: phase?.result ?? null,
            });
        }
        return index.get(phaseId);
    };

    for (const section of sections) {
        if (!phases.has(section.phaseId)) continue;
        const e = entry(section.phaseId);
        e.total += section.total ?? 0;

        if (section.phaseType === 'FINAL_FOUR') {
            e.four = section.lines ?? [];
        } else if (RANKING_TYPES.includes(section.phaseType)) {
            for (const line of section.lines ?? []) e.rows.set(line.contenderId, line);
        } else {
            for (const line of section.lines ?? []) e.battles.set(`${line.round}:${line.slot}`, line);
        }
    }

    return index;
}

/**
 * L'affiche officielle à mettre en face d'une affiche pronostiquée, orientée
 * comme elle.
 *
 * Celle qui a PAYÉ d'abord : le détail des points dit où le moteur l'a
 * trouvée (`matchedRound`, `matchedSlot`) — un autre emplacement, voire un
 * autre tour. Le calque doit montrer ce qui a rapporté, sinon une affiche
 * créditée de six points paraîtrait fausse.
 *
 * Un détail calculé avant que le moteur n'enregistre cet endroit n'a que
 * `matched` : on retrouve alors la paire dans le même tour, seule règle de
 * l'époque. Sans correspondance, l'affiche du même emplacement : c'est elle
 * qui a pris la place de celle qu'on avait annoncée.
 *
 * Orientée côté contender : si le pronostiqué A est le B officiel, on
 * retourne l'officielle, sinon une affiche juste paraîtrait inversée.
 */
function officialFor(pick, official, line) {
    const played = official?.battles ?? [];
    const key = pairKey(pick.contenderAId, pick.contenderBId);
    const samePair = (b) => b.contenderAId && b.contenderBId && pairKey(b.contenderAId, b.contenderBId) === key;

    let real = null;
    if (line?.matchedRound) {
        real = played.find((b) => b.round === line.matchedRound && b.slot === line.matchedSlot);
    } else if (line?.matched) {
        real = played.find((b) => b.round === pick.round && samePair(b));
    }
    real ??= played.find((b) => b.round === pick.round && b.slot === pick.slot);
    if (!real) return null;

    const flip = real.contenderAId === pick.contenderBId || real.contenderBId === pick.contenderAId;
    const base = { round: real.round, winnerId: real.winnerId };
    return flip
        ? { ...base, a: real.contenderBId, b: real.contenderAId, scoreA: real.scoreB, scoreB: real.scoreA }
        : { ...base, a: real.contenderAId, b: real.contenderBId, scoreA: real.scoreA, scoreB: real.scoreB };
}

/** Le niveau d'une ligne : tout juste, en partie, ou rien. Une couleur par niveau, et c'est tout. */
function tier(points, max) {
    if (points <= 0) return 'none';
    return points >= max ? 'full' : 'part';
}

/** « 1er », « 4e » — « 1st », « 4th ». */
function ordinal(n, lang) {
    if (lang === 'fr') return n === 1 ? '1er' : `${n}e`;
    const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
    return `${n}${s}`;
}

/** Le décalage d'apparition, plafonné. */
const delay = (i) => ({ '--score-i': Math.min(i, STAGGER_CAP) });

/* ---------------------------------------------------------------------------
   Une ligne de classement
   --------------------------------------------------------------------------- */

/**
 * Le niveau d'un écart de placement : pile, proche, loin. C'est ce qui colore
 * la colonne « écart » — une flèche seule disait la direction, pas si c'était
 * grave.
 */
function gapTier(gap) {
    if (gap === 0) return 'exact';
    return gap < 5 ? 'near' : 'far';
}

/**
 * L'en-tête de la colonne-calque, posé une fois au-dessus du classement.
 *
 * Il remplace l'intitulé « réel » que chaque ligne répétait : vingt fois le
 * même mot, c'était vingt fois du bruit entre l'œil et le chiffre.
 */
export function RankScoreHead({ mode }) {
    const { t } = useI18n();
    return (
        <span className={`score-strip score-strip--head score--${mode}`} style={delay(0)}>
            <span>{t('score.col.real')}</span>
            <span>{t('score.col.gap')}</span>
            <span title={t('score.qualified')}>Q</span>
            <span className="score-strip__pts">{t('score.pts')}</span>
        </span>
    );
}

/**
 * La colonne-calque d'une ligne de classement : le rang réel, l'écart, la
 * qualification, les points.
 *
 * Des colonnes de largeur FIXE, et c'est l'essentiel de la lisibilité : les
 * rangs réels s'alignent, les points s'alignent, et l'œil descend une colonne
 * au lieu de chercher le chiffre dans chaque bandeau.
 *
 * Une ligne absente du détail n'est pas une erreur : le contender n'a pas de
 * rang officiel (hors-radar, ou non départagé). Elle ne rapporte rien et le
 * dit, plutôt que de laisser un trou dans le calque.
 */
export function RankScore({ line, mode, i }) {
    const { t, lang } = useI18n();

    if (!line) {
        return (
            <span className={`score-strip score--${mode}`} style={delay(i)} title={t('score.unranked')}>
                <span className="score-strip__real score-strip__real--none">—</span>
                <span />
                <span />
                <span className="score-strip__pts score-strip__pts--none">0</span>
            </span>
        );
    }

    const diff = line.officialRank - line.predictedRank;
    const gap = Math.abs(diff);
    // « Tout juste », c'est la bonne place — le point de qualification est un
    // bonus à côté, il ne suffit pas à passer au vert.
    const level = line.points <= 0 ? 'none' : diff === 0 ? 'full' : 'part';

    return (
        <span
            className={`score-strip score--${mode}`}
            style={delay(i)}
            title={t('score.rank.detail', {
                said: ordinal(line.predictedRank, lang),
                real: ordinal(line.officialRank, lang),
                gap: line.gapPoints,
                qualif: line.qualificationPoints,
            })}
        >
            <span className="score-strip__real">{ordinal(line.officialRank, lang)}</span>
            {/* ↓ : l'artiste a fini plus bas qu'annoncé, ↑ plus haut. */}
            <span className={`score-strip__gap score-strip__gap--${gapTier(gap)}`}>
                {gap === 0 ? '=' : `${diff > 0 ? '↓' : '↑'}${gap}`}
            </span>
            <span className="score-strip__q">{line.qualificationPoints > 0 ? 'Q' : ''}</span>
            <span className={`score-strip__pts score-strip__pts--${level}`}>
                {line.points > 0 ? `+${line.points}` : '0'}
            </span>
        </span>
    );
}

/* ---------------------------------------------------------------------------
   Une affiche
   --------------------------------------------------------------------------- */

/**
 * La feuille posée sur une affiche : l'affiche réelle, et ce qui a payé.
 *
 * Chaque côté dit s'il était juste. Juste : le nom passe au vert. Faux : le
 * nom annoncé est barré, le vrai suit — la différence se lit sur une seule
 * ligne, sans aller-retour entre deux tableaux.
 */
export function BattleScore({ pick, line, official, byId, mode, i }) {
    const { t } = useI18n();
    const real = officialFor(pick, official, line);
    // Jouée dans un autre tour que celui annoncé : l'étiquette le dit, sinon
    // une affiche de quart posée sur une demie se lirait comme une erreur.
    const elsewhere = Boolean(real) && real.round !== pick.round;
    if (!real && !line) return null;

    const nameOf = (id) => byId.get(id)?.name ?? '—';
    const points = line?.points ?? 0;
    const level = tier(points, 6);

    const side = (predictedId, realId, realScore, predictedScore) => {
        const right = Boolean(realId) && predictedId === realId;
        const won = Boolean(real?.winnerId) && real.winnerId === realId;
        return (
            <div className={`score-sheet__side${won ? ' score-sheet__side--won' : ''}`}>
                {!right && predictedId && <s className="score-sheet__was">{nameOf(predictedId)}</s>}
                <span className={`score-sheet__name${right ? ' score-sheet__name--right' : ''}`}>
                    {realId ? nameOf(realId) : '—'}
                </span>
                {realScore != null && (
                    <span
                        className={
                            'score-sheet__score' +
                            (line?.scorePoints > 0 && predictedScore === realScore ? ' score-sheet__score--right' : '')
                        }
                    >
                        {realScore}
                    </span>
                )}
            </div>
        );
    };

    const pips = [
        ['happened', line?.happenedPoints ?? 0],
        ['winner', line?.winnerPoints ?? 0],
        ['score', line?.scorePoints ?? 0],
    ];

    return (
        <div className={`score-sheet score--${mode}`} style={delay(i)}>
            <span className={`score-sheet__tag${elsewhere ? ' score-sheet__tag--elsewhere' : ''}`}>
                {elsewhere
                    ? t('score.realIn', { round: t(`bracket.round.${real.round}`) })
                    : t('score.real')}
            </span>
            {real ? (
                <>
                    {side(pick.contenderAId, real.a, real.scoreA, pick.scoreA)}
                    {side(pick.contenderBId, real.b, real.scoreB, pick.scoreB)}
                </>
            ) : (
                <p className="score-sheet__none">{t('score.notPlayed')}</p>
            )}

            {line && (
                <span
                    className={`score-badge score-badge--${level}`}
                    title={pips.map(([k, v]) => `${t(`score.battle.${k}`)} +${v}`).join(' · ')}
                >
                    <span className="score-badge__value">{points > 0 ? `+${points}` : '0'}</span>
                    {/* Les trois points du barème, un témoin chacun : l'affiche,
                        le vainqueur, le score. Allumé quand il a payé. */}
                    <span className="score-badge__pips" aria-hidden="true">
                        {pips.map(([k, v]) => (
                            <span key={k} className={`score-pip${v > 0 ? ' score-pip--on' : ''}`} />
                        ))}
                    </span>
                    <span className="visually-hidden">
                        {pips.map(([k, v]) => `${t(`score.battle.${k}`)} +${v}`).join(', ')}
                    </span>
                </span>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------------
   L'en-tête de phase
   --------------------------------------------------------------------------- */

/**
 * Un nombre qui monte jusqu'à sa valeur.
 *
 * Six cents millisecondes, pas plus : c'est un effet d'arrivée, pas un
 * suspense. Sans mouvement réduit seulement — sinon la valeur tombe d'un coup.
 */
function useCountUp(target, running) {
    const [value, setValue] = useState(running ? 0 : target);

    useEffect(() => {
        if (!running) return undefined;
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (still || target <= 0) {
            setValue(target);
            return undefined;
        }
        let frame;
        const start = performance.now();
        const tick = (now) => {
            const k = Math.min(1, (now - start) / 600);
            // Décélération : les premiers points défilent vite, le dernier se pose.
            setValue(Math.round(target * (1 - (1 - k) ** 3)));
            if (k < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, running]);

    return value;
}

/**
 * Le total de la phase, et pour un tableau, le top 4 réel.
 *
 * Le top 4 a sa place ici et non sur les affiches : ses points ne regardent
 * pas le chemin, seulement l'arrivée. C'est là qu'on lit ce qu'on a sauvé
 * quand l'arbre s'est effondré en route.
 */
export function PhaseScore({ entry, byId, mode }) {
    const { t, lang } = useI18n();
    const shown = useCountUp(entry.total, mode === 'on');

    return (
        // L'enveloppe s'ouvre en hauteur : sans elle, l'en-tête apparaissait
        // d'un coup et poussait tout le classement vers le bas.
        <div className={`score-phase-wrap score-phase-wrap--${mode}`}>
            <div className={`score-phase score--${mode}`} style={delay(0)}>
                <span className={`score-chip score-chip--${entry.total > 0 ? 'full' : 'none'} score-phase__total`}>
                    +{shown} {t('score.pts')}
                </span>

                {entry.four?.length > 0 && (
                    <ol className="score-four" aria-label={t('score.top4')}>
                        {entry.four.map((line, k) => (
                            <li
                                key={line.place}
                                className={`score-four__place score--${mode}${line.hit ? ' score-four__place--hit' : ''}`}
                                style={delay(k + 1)}
                            >
                                <span className="score-four__rank">{ordinal(line.place, lang)}</span>
                                <span className="score-four__name">{byId.get(line.contenderId)?.name ?? '—'}</span>
                                <span className={`score-chip score-chip--${line.hit ? 'full' : 'none'}`}>
                                    {line.hit ? `+${line.points}` : '0'}
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}
