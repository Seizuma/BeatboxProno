import { prisma } from './prisma.js';
import { resolveBracket, bracketKey, MAIN_LINE, SEED_PATTERNS } from './bracket.js';

/**
 * Le tirage du premier tour d'un tableau, et ce qu'il faut faire des pronostics
 * quand il change.
 */

/** Les rangs attendus : 1..size, chacun au plus une fois, null pour un bye. */
export function validateSeedPairs(pairs, battleCount) {
    if (pairs == null) return { ok: true, pairs: null };

    if (!Array.isArray(pairs) || pairs.length !== battleCount) {
        return { ok: false, error: `Le tirage doit compter ${battleCount} affiches.` };
    }

    const size = battleCount * 2;
    const seen = new Set();

    for (const [i, pair] of pairs.entries()) {
        if (!Array.isArray(pair) || pair.length !== 2) {
            return { ok: false, error: `Affiche ${i + 1} : deux rangs attendus.` };
        }
        for (const seed of pair) {
            if (seed == null) continue; // bye assumé
            if (!Number.isInteger(seed) || seed < 1 || seed > size) {
                return { ok: false, error: `Affiche ${i + 1} : le rang ${seed} sort de 1–${size}.` };
            }
            if (seen.has(seed)) {
                return { ok: false, error: `Le rang ${seed} apparaît deux fois.` };
            }
            seen.add(seed);
        }
        if (pair[0] == null && pair[1] == null) {
            return { ok: false, error: `Affiche ${i + 1} : au moins un rang est nécessaire.` };
        }
    }

    return { ok: true, pairs };
}

/** Engendre un tirage à partir d'un modèle nommé. */
export function patternFor(name, size) {
    const make = SEED_PATTERNS[name];
    return make ? make(size) : null;
}

/**
 * Recalcule les pronostics d'un tableau après un changement de tirage.
 *
 * Sans cela, un pronostic rempli sous l'ancien format garde des affiches qui
 * n'existent plus. Le score apparie les affiches par couple de participants :
 * une affiche périmée ne correspond à rien et ne rapporte rien. La personne
 * perdrait des points pour une décision qui n'est pas la sienne.
 *
 * On repart de ce qui reste vrai — son classement de qualification, et ses
 * vainqueurs — puis on laisse la résolution recomposer l'arbre. Un vainqueur
 * qui ne figure plus dans son affiche tombe ; les autres survivent.
 *
 * @returns {Promise<{predictions: number, battles: number}>}
 */
export async function reresolvePhase(phaseId) {
    const phase = await prisma.phase.findUnique({
        where: { id: phaseId },
        include: {
            battles: true,
            category: { include: { phases: { include: { entries: true } } } },
        },
    });
    if (!phase) throw new Error('Phase introuvable.');

    const rounds = [...new Set(phase.battles.map((b) => b.round))];
    const battlesOf = {};
    for (const b of phase.battles) (battlesOf[b.round] ??= []).push(b);
    for (const list of Object.values(battlesOf)) list.sort((x, y) => x.slot - y.slot);

    // La qualification qui alimente le tableau, et son classement officiel s'il
    // est publié — exactement la règle qu'applique la page de pronostic.
    const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
    const qualifying = [...phase.category.phases]
        .filter((p) => RANKING_TYPES.includes(p.type))
        .sort((a, b) => a.position - b.position)
        .pop();

    const officialSeed = (qualifying?.resolved ? qualifying.entries : [])
        .filter((e) => e.rank != null && (qualifying.qualifierCount ? e.qualified : true))
        .sort((a, b) => a.rank - b.rank)
        .map((e) => e.contenderId);

    const officialDraw = !qualifying || Boolean(qualifying.resolved);

    const predictions = await prisma.prediction.findMany({
        where: { categoryId: phase.categoryId },
        include: {
            ranks: qualifying ? { where: { phaseId: qualifying.id } } : false,
            battles: { where: { phaseId } },
        },
    });

    let touched = 0;
    let written = 0;

    for (const prediction of predictions) {
        const mySeed = [...(prediction.ranks ?? [])]
            .sort((a, b) => a.rank - b.rank)
            .map((r) => r.contenderId);

        const picks = {};
        for (const b of prediction.battles) {
            picks[bracketKey(b.round, b.slot)] = {
                round: b.round,
                slot: b.slot,
                winnerId: b.winnerId,
                scoreA: b.scoreA,
                scoreB: b.scoreB,
            };
        }

        const resolved = resolveBracket({
            battlesOf,
            rounds,
            picks,
            seedFromRanking: officialSeed.length ? officialSeed : mySeed,
            resolvedPhase: phase.resolved,
            authoritative: false,
            officialDraw,
            seedPairs: phase.seedPairs ?? null,
        });

        const rows = [];
        for (const [, r] of resolved) {
            if (!r.a && !r.b) continue; // affiche indéterminée : rien à retenir
            rows.push({
                predictionId: prediction.id,
                phaseId,
                round: r.round,
                slot: r.slot,
                contenderAId: r.a,
                contenderBId: r.b,
                winnerId: r.winnerId,
                scoreA: r.scoreA,
                scoreB: r.scoreB,
            });
        }

        // Remplacement en bloc plutôt que mise à jour ligne à ligne : le nouveau
        // tirage peut faire disparaître des affiches autant qu'en créer, et une
        // transaction évite qu'un pronostic reste à moitié converti.
        await prisma.$transaction([
            prisma.predictedBattle.deleteMany({ where: { predictionId: prediction.id, phaseId } }),
            ...(rows.length ? [prisma.predictedBattle.createMany({ data: rows })] : []),
        ]);

        touched += 1;
        written += rows.length;
    }

    return { predictions: touched, battles: written };
}

/** Le premier tour d'un tableau, pour dimensionner le tirage. */
export function firstRoundOf(battles) {
    const rounds = new Set(battles.map((b) => b.round));
    const round = MAIN_LINE.find((r) => rounds.has(r)) ?? null;
    return { round, count: battles.filter((b) => b.round === round).length };
}