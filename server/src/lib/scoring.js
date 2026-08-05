/**
 * Moteur de score — fonctions pures, aucune dépendance à Prisma.
 * Toutes les règles du barème vivent ici et nulle part ailleurs.
 *
 * BARÈME
 * ------
 * Wildcards & éliminations
 *   +1 point par contender dont on a correctement prédit la qualification
 *   +1 à +5 points par écart de placement (écart 0 → 5, écart 4 → 1, ≥5 → 0)
 *
 * Phases de seeding
 *   uniquement les points d'écart de placement
 *
 * Brackets — pour chaque battle
 *   +2 si la battle a bien eu lieu (même si le seeding diffère)
 *   +2 si le vainqueur est le bon
 *   +2 si le score est le bon
 *
 * Top 4 final
 *   +5 / +4 / +3 / +2 pour les places 1 / 2 / 3 / 4 (soit 14 au total)
 */

export const GAP_MAX_BONUS = 5;
export const BATTLE_HAPPENED = 2;
export const BATTLE_WINNER = 2;
export const BATTLE_SCORE = 2;
export const PODIUM_POINTS = { 1: 5, 2: 4, 3: 3, 4: 2 };
export const QUALIFIED_POINT = 1;

/** Écart 0 → 5 pts, 1 → 4, 2 → 3, 3 → 2, 4 → 1, ≥5 → 0. */
export function gapPoints(predictedRank, officialRank) {
  if (!Number.isInteger(predictedRank) || !Number.isInteger(officialRank)) return 0;
  const gap = Math.abs(predictedRank - officialRank);
  return Math.max(0, GAP_MAX_BONUS - gap);
}

/**
 * Score d'une phase de classement (SEEDING / WILDCARD / ELIMINATION).
 *
 * @param {'SEEDING'|'WILDCARD'|'ELIMINATION'} type
 * @param {Array<{contenderId:string, rank:number}>} predicted
 * @param {Array<{contenderId:string, rank:number|null, qualified:boolean}>} official
 * @param {number|null} qualifierCount  nb de qualifiés — sinon déduit de `official`
 */
export function scoreRankingPhase(type, predicted, official, qualifierCount = null) {
  const lines = [];
  let total = 0;

  const officialById = new Map(official.map((e) => [e.contenderId, e]));
  const countsQualification = type === 'WILDCARD' || type === 'ELIMINATION';

  // Les qualifiés prédits = les N premiers du classement pronostiqué.
  const cutoff =
    qualifierCount ?? official.filter((e) => e.qualified).length ?? 0;
  const predictedQualified = new Set(
    [...predicted]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, cutoff)
      .map((p) => p.contenderId)
  );

  for (const pick of predicted) {
    const actual = officialById.get(pick.contenderId);
    if (!actual || actual.rank == null) continue;

    const gap = gapPoints(pick.rank, actual.rank);
    let qualification = 0;

    if (countsQualification && actual.qualified && predictedQualified.has(pick.contenderId)) {
      qualification = QUALIFIED_POINT;
    }

    const points = gap + qualification;
    total += points;
    lines.push({
      contenderId: pick.contenderId,
      predictedRank: pick.rank,
      officialRank: actual.rank,
      gap: Math.abs(pick.rank - actual.rank),
      gapPoints: gap,
      qualificationPoints: qualification,
      points,
    });
  }

  return { total, lines };
}

const pairKey = (a, b) => [a, b].filter(Boolean).sort().join('::');

/**
 * Score d'une phase à battles (BRACKET / LEGACY).
 *
 * Une battle prédite rapporte ses 2 points « la battle a eu lieu » dès lors que
 * l'affiche existe dans le même tour, même si elle n'est pas au même slot —
 * c'est le sens de « même si le seeding n'est pas le même ».
 *
 * @param {Array} predicted  {round, slot, contenderAId, contenderBId, winnerId, scoreA, scoreB}
 * @param {Array} official   {round, slot, contenderAId, contenderBId, winnerId, scoreA, scoreB, played}
 */
export function scoreBattlePhase(predicted, official) {
  const lines = [];
  let total = 0;

  // Index des battles officielles jouées, par tour puis par paire.
  const byRound = new Map();
  for (const b of official) {
    if (!b.played || !b.contenderAId || !b.contenderBId) continue;
    if (!byRound.has(b.round)) byRound.set(b.round, new Map());
    byRound.get(b.round).set(pairKey(b.contenderAId, b.contenderBId), b);
  }

  const consumed = new Set(); // une battle officielle ne paie qu'une fois

  for (const pick of predicted) {
    if (!pick.contenderAId || !pick.contenderBId) continue;

    const key = pairKey(pick.contenderAId, pick.contenderBId);
    const match = byRound.get(pick.round)?.get(key);
    const uid = match ? `${match.round}#${match.slot}` : null;

    let happened = 0;
    let winner = 0;
    let score = 0;

    if (match && !consumed.has(uid)) {
      consumed.add(uid);
      happened = BATTLE_HAPPENED;

      if (pick.winnerId && pick.winnerId === match.winnerId) {
        winner = BATTLE_WINNER;
      }

      // Le score est comparé côté contender, pas côté colonne A/B :
      // prédire « Alem 3 - 0 NaPoM » vaut même si l'officiel liste NaPoM en A.
      if (isSameScore(pick, match)) score = BATTLE_SCORE;
    }

    const points = happened + winner + score;
    total += points;
    lines.push({
      round: pick.round,
      slot: pick.slot,
      contenderAId: pick.contenderAId,
      contenderBId: pick.contenderBId,
      matched: Boolean(match),
      happenedPoints: happened,
      winnerPoints: winner,
      scorePoints: score,
      points,
    });
  }

  return { total, lines };
}

function isSameScore(pick, match) {
  if (pick.scoreA == null || pick.scoreB == null) return false;
  if (match.scoreA == null || match.scoreB == null) return false;

  const predByContender = {
    [pick.contenderAId]: pick.scoreA,
    [pick.contenderBId]: pick.scoreB,
  };
  const realByContender = {
    [match.contenderAId]: match.scoreA,
    [match.contenderBId]: match.scoreB,
  };

  return Object.entries(predByContender).every(
    ([id, value]) => realByContender[id] === value
  );
}

/**
 * Score du top 4 final.
 * @param {Array<{rank:number, contenderId:string}>} predicted
 * @param {Array<{rank:number, contenderId:string}>} official
 */
export function scorePodium(predicted, official) {
  const officialByRank = new Map(official.map((s) => [s.rank, s.contenderId]));
  const lines = [];
  let total = 0;

  for (const pick of predicted) {
    const points =
      officialByRank.get(pick.rank) === pick.contenderId
        ? PODIUM_POINTS[pick.rank] ?? 0
        : 0;
    total += points;
    lines.push({
      rank: pick.rank,
      contenderId: pick.contenderId,
      officialContenderId: officialByRank.get(pick.rank) ?? null,
      points,
    });
  }

  return { total, lines };
}

/**
 * Assemble le score complet d'un pronostic de catégorie.
 * @param {object} prediction  ranks[], battles[], podium[]
 * @param {object} category    phases[] (avec entries[] et battles[]), podium[]
 */
export function scorePrediction(prediction, category) {
  const sections = [];
  let total = 0;

  for (const phase of category.phases) {
    if (!phase.resolved) continue;

    if (phase.type === 'BRACKET' || phase.type === 'LEGACY') {
      const picks = prediction.battles.filter((b) => b.phaseId === phase.id);
      const result = scoreBattlePhase(picks, phase.battles);
      total += result.total;
      sections.push({
        phaseId: phase.id,
        phaseName: phase.name,
        phaseType: phase.type,
        ...result,
      });
    } else {
      const picks = prediction.ranks.filter((r) => r.phaseId === phase.id);
      const result = scoreRankingPhase(
        phase.type,
        picks,
        phase.entries,
        phase.qualifierCount
      );
      total += result.total;
      sections.push({
        phaseId: phase.id,
        phaseName: phase.name,
        phaseType: phase.type,
        ...result,
      });
    }
  }

  if (category.podium?.length) {
    const result = scorePodium(prediction.podium, category.podium);
    total += result.total;
    sections.push({
      phaseId: null,
      phaseName: 'Top 4 final',
      phaseType: 'PODIUM',
      ...result,
    });
  }

  return { total, sections };
}
