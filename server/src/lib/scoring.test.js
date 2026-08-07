import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gapPoints,
  scoreRankingPhase,
  scoreBattlePhase,
  scorePrediction,
} from './scoring.js';

test('les points d écart suivent 5,4,3,2,1,0', () => {
  assert.equal(gapPoints(1, 1), 5);
  assert.equal(gapPoints(1, 2), 4);
  assert.equal(gapPoints(1, 5), 1);
  assert.equal(gapPoints(1, 6), 0);
  assert.equal(gapPoints(1, 20), 0);
});

test('un wildcard cumule écart et qualification', () => {
  const predicted = [
    { contenderId: 'a', rank: 1 },
    { contenderId: 'b', rank: 2 },
    { contenderId: 'c', rank: 3 },
  ];
  const official = [
    { contenderId: 'a', rank: 1, qualified: true },
    { contenderId: 'b', rank: 3, qualified: false },
    { contenderId: 'c', rank: 2, qualified: true },
  ];
  // a : écart 0 => 5 + qualifié prédit dans le top 2 => +1  = 6
  // b : écart 1 => 4, prédit qualifié mais ne l'est pas    = 4
  // c : écart 1 => 4, qualifié mais prédit 3e (hors top 2) = 4
  const { total } = scoreRankingPhase('WILDCARD', predicted, official, 2);
  assert.equal(total, 14);
});

test('une phase de seeding ignore les points de qualification', () => {
  const predicted = [{ contenderId: 'a', rank: 1 }];
  const official = [{ contenderId: 'a', rank: 1, qualified: true }];
  const { total } = scoreRankingPhase('SEEDING', predicted, official, 1);
  assert.equal(total, 5);
});

test('une battle trouvée dans un autre slot du meme tour paie quand meme', () => {
  const predicted = [
    { round: 'SEMI', slot: 0, contenderAId: 'x', contenderBId: 'y', winnerId: 'x', scoreA: 3, scoreB: 0 },
  ];
  const official = [
    { round: 'SEMI', slot: 1, contenderAId: 'y', contenderBId: 'x', winnerId: 'x', scoreA: 0, scoreB: 3, played: true },
  ];
  const { total } = scoreBattlePhase(predicted, official);
  assert.equal(total, 6); // affiche + vainqueur + score
});

test('une affiche inexistante ne rapporte rien', () => {
  const predicted = [
    { round: 'FINAL', slot: 0, contenderAId: 'x', contenderBId: 'z', winnerId: 'x' },
  ];
  const official = [
    { round: 'FINAL', slot: 0, contenderAId: 'x', contenderBId: 'y', winnerId: 'x', played: true },
  ];
  assert.equal(scoreBattlePhase(predicted, official).total, 0);
});

test('le classement final n est plus une source de points', () => {
  // Un pronostic peut encore contenir un podium hérité d'avant la refonte :
  // il doit être ignoré, pas compté.
  const category = {
    phases: [
      {
        id: 'p1',
        name: 'Finale',
        type: 'BRACKET',
        resolved: true,
        battles: [
          { round: 'FINAL', slot: 0, contenderAId: 'a', contenderBId: 'b', winnerId: 'a', played: true },
        ],
      },
    ],
    podium: [
      { rank: 1, contenderId: 'a' },
      { rank: 2, contenderId: 'b' },
    ],
  };
  const prediction = {
    ranks: [],
    battles: [{ phaseId: 'p1', round: 'FINAL', slot: 0, contenderAId: 'a', contenderBId: 'b', winnerId: 'a' }],
    podium: [
      { rank: 1, contenderId: 'a' },
      { rank: 2, contenderId: 'b' },
    ],
  };
  const { total, sections } = scorePrediction(prediction, category);
  assert.equal(total, 4); // +2 l'affiche a eu lieu, +2 le bon vainqueur. Rien pour le podium.
  assert.equal(sections.length, 1);
  assert.equal(sections.some((s) => s.phaseType === 'PODIUM'), false);
});