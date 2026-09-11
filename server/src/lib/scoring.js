import { isWildcardCategory } from './wildcard.js';

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
 * Top 4 final — une fois par tableau
 *   +5 pour le vainqueur, +4 pour le finaliste, +3 pour le troisième,
 *   +2 pour le quatrième, à condition de les avoir mis à cette place-là.
 */

export const GAP_MAX_BONUS = 5;
export const BATTLE_HAPPENED = 2;
export const BATTLE_WINNER = 2;
export const BATTLE_SCORE = 2;
export const QUALIFIED_POINT = 1;

/**
 * Le point de qualification d'une COMPÉTITION de wildcards.
 *
 * Un point, comme partout ailleurs.
 *
 * ─── Pourquoi ce n'est plus trois ───────────────────────────────────────────
 *
 * Le raisonnement d'origine tenait debout — « qui passe » EST la compétition
 * d'une sélection sur vidéo, alors que dans un tableau la qualification n'est
 * qu'un détail au bord d'un classement — mais il produisait un barème que
 * personne ne pouvait lire. Sur une sélection à 16 places, un pronostic parfait
 * valait 20 × 5 + 16 × 3 = 148 points, dont 48 pour un geste que le joueur ne
 * distingue pas du placement : il compose UNE liste ordonnée, et le site en
 * tirait deux récompenses de poids différents sans que rien à l'écran ne le
 * dise.
 *
 * À un point, la qualification redevient ce qu'elle est partout — un bonus
 * discret au-dessus du placement — et le même pronostic vaut 116 points, dont
 * la quasi-totalité pour la seule chose qu'on a réellement demandée : classer.
 *
 * Une seule constante pour les trois calculs. `scoring.js`, `maxscore.js` et
 * `scoreboard.js` la lisent tous : la changer ici les déplace ensemble, ce qui
 * est la raison d'être de cet export.
 */
export const WILDCARD_HIT = 1;

/**
 * Le podium final, place par place : 5 points pour le vainqueur, 4 pour le
 * finaliste, 3 pour le troisième, 2 pour le quatrième. Quatorze en tout.
 *
 * ─── Pourquoi ce barème existe ──────────────────────────────────────────────
 *
 * Un tableau se marche sur lui-même : une affiche ratée en quarts fait dérailler
 * toutes les suivantes, et quelqu'un qui avait pourtant vu le bon vainqueur
 * repartait avec zéro sur la moitié basse de son arbre. Ces points-là ne
 * regardent pas le chemin, seulement l'arrivée — voir juste qui finit premier
 * vaut quelque chose, même quand on s'est trompé sur la route.
 *
 * D'où la dégressivité : le vainqueur est le pronostic qui demande le plus de
 * justesse, et la quatrième place le moins.
 */
export const FINAL_FOUR_POINTS = [5, 4, 3, 2];

const FINAL_ROUNDS = ['FINAL', 'SMALL_FINAL'];

/**
 * Le top 4 déduit d'un tableau : [1er, 2e, 3e, 4e].
 *
 * Rien n'est stocké — le podium se LIT dans les deux dernières affiches. La
 * finale donne les deux premières places, la petite finale les deux suivantes.
 * Un format sans petite finale n'a donc pas de 3e ni de 4e, et ces places-là ne
 * rapportent ni ne coûtent rien : les cases restent à `null` des deux côtés du
 * rapport.
 *
 * `playedOnly` distingue les deux usages. Une affiche officielle ne compte que
 * jouée ; l'affiche pronostiquée d'un joueur n'a pas de notion de « jouée », un
 * vainqueur désigné suffit.
 */
export function finalFour(battles, { playedOnly = false } = {}) {
  const places = [null, null, null, null];

  const pairOf = (round) => {
    const b = (battles ?? []).find(
      (x) =>
        x.round === round &&
        x.contenderAId &&
        x.contenderBId &&
        x.winnerId &&
        (!playedOnly || x.played)
    );
    if (!b) return null;
    const loser = b.winnerId === b.contenderAId ? b.contenderBId : b.contenderAId;
    return [b.winnerId, loser];
  };

  const final = pairOf('FINAL');
  if (final) [places[0], places[1]] = final;

  const small = pairOf('SMALL_FINAL');
  if (small) [places[2], places[3]] = small;

  return places;
}

/**
 * Les points du top 4 final.
 *
 * La place compte autant que le nom : mettre le vainqueur en finaliste ne
 * rapporte pas les 5 points, parce que « qui gagne » et « qui perd la finale »
 * sont deux pronostics différents et que le second est plus facile.
 *
 * On n'énumère que les places RÉELLEMENT attribuées. Une place qui n'existe pas
 * — pas de petite finale, ou finale pas encore jouée — n'apparaît nulle part,
 * ni en points gagnés ni en points possibles.
 */
export function scoreFinalFour(predicted, official) {
  const mine = finalFour(predicted);
  const real = finalFour(official, { playedOnly: true });

  const lines = [];
  let total = 0;

  real.forEach((contenderId, index) => {
    if (!contenderId) return;
    const hit = mine[index] === contenderId;
    const points = hit ? FINAL_FOUR_POINTS[index] : 0;
    total += points;
    lines.push({
      place: index + 1,
      // L'identifiant OFFICIEL, pas celui pronostiqué : c'est lui qui permet à
      // la fiche d'un artiste de dire « ce joueur a marqué grâce à moi ».
      contenderId,
      predictedId: mine[index] ?? null,
      hit,
      points,
    });
  });

  return { total, lines };
}

/* ---------------------------------------------------------------------------
   LES QUALIFIÉS HORS-RADAR

   Le championnat de France accepte les vidéos de qualification en « non
   répertoriée » sur YouTube. Des candidats passent donc la sélection sans que
   personne, hors du jury, ait su qu'ils concouraient : ils ne figurent dans le
   top d'AUCUN joueur, et pas par erreur de pronostic — leur existence n'était
   pas connaissable.

   Les trois fonctions ci-dessous sont la seule façon de lire un classement
   officiel. `scoring.js`, `maxscore.js` et `scoreboard.js` passent toutes par
   elles : ces trois fichiers doivent s'accorder au point près, sinon la
   précision affichée au classement dérape — c'est le défaut qu'on a déjà mis
   deux jours à trouver sur le Crew.
   --------------------------------------------------------------------------- */

/**
 * Le classement tel que les joueurs pouvaient le connaître.
 *
 * Les lignes hors-radar sortent, et les rangs restants se RESSERRENT sur 1..n.
 *
 * ─── Pourquoi le resserrement est le cœur du correctif ──────────────────────
 *
 * Retirer les lignes ne suffit pas. Si le troisième d'une sélection est
 * hors-radar, les suivants restent officiellement 4e, 5e, 6e alors que les
 * joueurs les ont classés 3e, 4e, 5e : chacun perd un point de placement sur
 * toute la queue du classement, en cascade, pour quelqu'un dont il ignorait
 * l'existence. Le décalage coûtait plus cher que la place manquée.
 *
 * Après resserrement, la compète se score exactement comme si ces candidats
 * n'avaient pas concouru.
 *
 * ─── Le cas de celui qui l'aurait quand même deviné ─────────────────────────
 *
 * Il ne marque rien : sa ligne n'existe plus dans le rapport. C'est voulu. « Ne
 * pas influer sur les points » va dans les deux sens, et récompenser un
 * pronostic que le site lui-même juge impossible ouvrirait la porte à
 * l'information d'initié.
 */
export function onRadar(entries) {
  const kept = (entries ?? []).filter((e) => !e.offRadar);

  const tightened = new Map(
    kept
      .filter((e) => e.rank != null)
      .sort((a, b) => a.rank - b.rank)
      .map((e, index) => [e.contenderId, index + 1])
  );

  return kept.map((e) => (e.rank == null ? e : { ...e, rank: tightened.get(e.contenderId) }));
}

/**
 * Le nombre de classés que les joueurs pouvaient connaître.
 *
 * Séparé de `onRadar` parce que deux des trois appelants ne veulent QUE ce
 * compte : les faire construire un tableau complet pour en mesurer la longueur
 * serait du travail pour rien, et surtout ils ne disposent pas toujours de
 * `contenderId` dans leur requête.
 */
export function onRadarRanked(entries) {
  return (entries ?? []).filter((e) => !e.offRadar && e.rank != null).length;
}

/**
 * La coupe, diminuée des places prises hors-radar.
 *
 * Une sélection à seize places dont deux reviennent à des candidats invisibles
 * n'en offrait réellement que quatorze aux pronostiqueurs. Laisser la coupe à
 * seize ferait chercher deux bonnes réponses de plus qu'il n'en existait.
 */
export function onRadarCut(entries, qualifierCount) {
  if (!Number.isInteger(qualifierCount)) return 0;
  const hidden = (entries ?? []).filter((e) => e.offRadar && e.qualified).length;
  return Math.max(0, qualifierCount - hidden);
}

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
/**
 * @param {number} [hitValue]  ce que vaut une qualification devinée. Un point
 *   partout, y compris dans une compétition de wildcards depuis que le barème
 *   principal.
 */
export function scoreRankingPhase(type, predicted, official, qualifierCount = null, hitValue = QUALIFIED_POINT) {
  const lines = [];
  let total = 0;

  // Le classement passe par le filtre hors-radar AVANT toute comparaison. Le
  // faire ici plutôt que chez les appelants garantit qu'aucun chemin de calcul
  // ne l'oublie — y compris ceux qu'on écrira plus tard.
  const visible = onRadar(official);
  const officialById = new Map(visible.map((e) => [e.contenderId, e]));

  /**
   * Le point de qualification ne récompense que ce qui pouvait être manqué.
   *
   * Trois conditions, et elles sont exactement celles de `maxScoreForCategory`
   * et de `maxOnResolved` — c'est la seule façon d'obtenir une précision qui
   * reste sous les 100 % :
   *   — le barème réserve ces points aux types WILDCARD et ELIMINATION ;
   *   — la coupe doit exister ;
   *   — et surtout, elle doit être STRICTEMENT plus petite que le nombre de
   *     classés. Une finale à quatre crews où les quatre passent n'élimine
   *     personne : « prédire » leur qualification, c'est cocher une case sans
   *     enjeu. Le maximum ne comptait déjà pas ces points ; le score, si, et un
   *     pronostic parfait sortait à 36 sur 32 — 113 % de réussite.
   *
   * Le nombre de classés, et non celui des inscrits : un participant sans rang
   * officiel n'a pas été départagé, il ne compte d'aucun côté du rapport.
   */
  const ranked = onRadarRanked(official);
  // La coupe vient du réglage de la phase, et de lui seul. Elle se déduisait
  // auparavant du nombre de contenders marqués qualifiés quand le réglage était
  // vide — mais les deux calculs de maximum, eux, lisent `qualifierCount ?? 0`.
  // Une phase sans coupe renseignée distribuait donc des points que le maximum
  // ne prévoyait pas : le même dépassement, par une autre porte.
  const cut = onRadarCut(official, qualifierCount);
  const countsQualification =
    (type === 'WILDCARD' || type === 'ELIMINATION') && cut > 0 && cut < ranked;

  // Les qualifiés prédits = les N premiers du classement pronostiqué.
  const predictedQualified = new Set(
    [...predicted]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, cut)
      .map((p) => p.contenderId)
  );

  for (const pick of predicted) {
    const actual = officialById.get(pick.contenderId);
    if (!actual || actual.rank == null) continue;

    const gap = gapPoints(pick.rank, actual.rank);
    let qualification = 0;

    if (countsQualification && actual.qualified && predictedQualified.has(pick.contenderId)) {
      qualification = hitValue;
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
 * Assemble le score complet d'un pronostic de catégorie.
 * @param {object} prediction  ranks[], battles[]
 * @param {object} category    phases[] (avec entries[] et battles[])
 */
export function scorePrediction(prediction, category) {
  /**
   * Une catégorie hors barème ne rapporte rien, et ne produit aucune section.
   *
   * Le test est ici plutôt que chez l'appelant parce que c'est la SEULE porte
   * d'entrée du calcul de points : le recalcul de catégorie, celui d'événement
   * et l'inspection d'un pronostic y passent tous. Un garde posé dans une
   * route, c'est deux autres routes à retrouver le jour où l'on en ajoute une.
   *
   * Aucune section plutôt que des sections à zéro : une liste de lignes qui
   * valent toutes zéro invite à chercher pourquoi, alors que l'absence, elle,
   * appelle la phrase d'explication que la page affiche à la place.
   */
  if (category.noPoints) return { total: 0, sections: [] };

  // Une compétition de wildcards n'a qu'une phase, et c'est une phase de
  // classement. La règle se lit dans la structure, pas dans un drapeau qu'on
  // aurait pu oublier de mettre à jour après une retouche de format.
  const wildcard = isWildcardCategory(category);
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

      // Le top 4 sort dans sa PROPRE section, et pas ajouté au total du
      // tableau : ses lignes n'ont pas la forme d'une affiche, et surtout un
      // joueur doit pouvoir lire d'un coup d'œil ce qu'il a sauvé à l'arrivée
      // quand son arbre s'est effondré en route. Noyé dans les points
      // d'affiches, ce serait invisible.
      //
      // Réservé au BRACKET : une catégorie Legacy n'a pas de finale.
      if (phase.type === 'BRACKET') {
        const four = scoreFinalFour(picks, phase.battles);
        if (four.lines.length) {
          total += four.total;
          sections.push({
            phaseId: phase.id,
            phaseName: `${phase.name} — top 4`,
            phaseType: 'FINAL_FOUR',
            ...four,
          });
        }
      }
    } else {
      const picks = prediction.ranks.filter((r) => r.phaseId === phase.id);
      const result = scoreRankingPhase(
        phase.type,
        picks,
        phase.entries,
        phase.qualifierCount,
        // Une compétition de wildcards ne demande pas autre chose : la
        // qualification y vaut trois fois plus qu'ailleurs.
        wildcard ? WILDCARD_HIT : QUALIFIED_POINT
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

  return { total, sections };
}