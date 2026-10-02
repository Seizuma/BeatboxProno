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

/** Au-delà, les éléments apparaissent ensemble : un long classement ne doit pas mettre deux secondes à se poser. */
const STAGGER_CAP = 14;
const STAGGER_MS = 28;

/** La durée totale d'une disparition, décalages compris : ce qu'il faut attendre avant de démonter. */
export const SCORE_LAYER_EXIT_MS = 260 + STAGGER_CAP * STAGGER_MS;

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
 * D'abord la même paire dans le même tour, où qu'elle soit : c'est la règle du
 * barème — « la battle a eu lieu » paie même si le seeding diffère — et le
 * calque doit montrer ce qui a payé. À défaut, l'affiche du même emplacement :
 * c'est elle qui a pris la place de celle qu'on avait annoncée.
 *
 * Orientée côté contender : si le pronostiqué A est le B officiel, on
 * retourne l'officielle, sinon une affiche juste paraîtrait inversée.
 */
function officialFor(pick, official) {
    const played = official?.battles ?? [];
    const sameRound = played.filter((b) => b.round === pick.round);
    const key = pairKey(pick.contenderAId, pick.contenderBId);
    const real =
        sameRound.find((b) => b.contenderAId && b.contenderBId && pairKey(b.contenderAId, b.contenderBId) === key) ??
        sameRound.find((b) => b.slot === pick.slot);
    if (!real) return null;

    const flip = real.contenderAId === pick.contenderBId || real.contenderBId === pick.contenderAId;
    return flip
        ? { a: real.contenderBId, b: real.contenderAId, scoreA: real.scoreB, scoreB: real.scoreA, winnerId: real.winnerId }
        : { a: real.contenderAId, b: real.contenderBId, scoreA: real.scoreA, scoreB: real.scoreB, winnerId: real.winnerId };
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
 * Le bandeau posé sur une ligne de classement : le rang réel, l'écart, les
 * points.
 *
 * Une ligne absente du détail n'est pas une erreur : le contender n'a pas de
 * rang officiel (hors-radar, ou non départagé). Elle ne rapporte rien et le
 * dit, plutôt que de laisser un trou dans le calque.
 */
export function RankScore({ line, mode, i }) {
    const { t, lang } = useI18n();

    if (!line) {
        return (
            <span className={`score-strip score-strip--none score--${mode}`} style={delay(i)}>
                <span className="score-strip__real">{t('score.unranked')}</span>
                <span className="score-chip score-chip--none">0</span>
            </span>
        );
    }

    const diff = line.officialRank - line.predictedRank;
    // « Tout juste », c'est la bonne place — le point de qualification est un
    // bonus à côté, il ne suffit pas à passer au vert.
    const level = line.points <= 0 ? 'none' : diff === 0 ? 'full' : 'part';

    return (
        <span
            className={`score-strip score-strip--${level} score--${mode}`}
            style={delay(i)}
            title={t('score.rank.detail', { gap: line.gapPoints, qualif: line.qualificationPoints })}
        >
            <span className="score-strip__real">
                <span className="score-strip__label">{t('score.real')}</span>
                {ordinal(line.officialRank, lang)}
            </span>
            {/* L'écart en flèches télétexte : ▼ quand l'artiste a fini plus bas
                qu'annoncé, ▲ plus haut, « = » pile à la place. */}
            <span className={`score-strip__gap${diff === 0 ? ' score-strip__gap--exact' : ''}`}>
                {diff === 0 ? '=' : `${diff > 0 ? '▼' : '▲'}${Math.abs(diff)}`}
            </span>
            {line.qualificationPoints > 0 && (
                <span className="score-strip__q" title={t('score.qualified')}>Q</span>
            )}
            <span className={`score-chip score-chip--${level}`}>
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
    const real = officialFor(pick, official);
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
            <span className="score-sheet__tag">{t('score.real')}</span>
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
    );
}
