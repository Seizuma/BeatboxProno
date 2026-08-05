import { useMemo } from 'react';

const ROUND_LABEL = {
  ROUND_OF_16: 'Huitièmes',
  QUARTER: 'Quarts de finale',
  SEMI: 'Demi-finales',
  SMALL_FINAL: 'Petite finale',
  FINAL: 'Finale',
  LEGACY: 'Legacy',
};

const MAIN_LINE = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];
const DISPLAY_ORDER = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

/** Splits de votes proposés — 3 juges, ou 5 pour les grosses finales. */
const SCORES = [
  { label: 'Sans avis', a: null, b: null },
  { label: '3 – 0', a: 3, b: 0 },
  { label: '2 – 1', a: 2, b: 1 },
  { label: '1 – 2', a: 1, b: 2 },
  { label: '0 – 3', a: 0, b: 3 },
  { label: '5 – 0', a: 5, b: 0 },
  { label: '4 – 1', a: 4, b: 1 },
  { label: '3 – 2', a: 3, b: 2 },
];

const key = (round, slot) => `${round}:${slot}`;

/**
 * @param {object[]} phaseBattles  squelette officiel {round, slot, contenderAId, contenderBId, label}
 * @param {object}   picks         { "ROUND:SLOT": {contenderAId, contenderBId, winnerId, scoreA, scoreB} }
 * @param {string[]} seedFromRanking  ordre pronostiqué de la phase précédente,
 *                                    utilisé pour composer le premier tour
 */
export default function BracketBoard({
  phase,
  phaseBattles,
  contenders,
  picks,
  onChange,
  locked,
  seedFromRanking = [],
}) {
  const byId = useMemo(() => new Map(contenders.map((c) => [c.id, c])), [contenders]);

  const rounds = useMemo(() => {
    const present = [...new Set(phaseBattles.map((b) => b.round))];
    return DISPLAY_ORDER.filter((r) => present.includes(r));
  }, [phaseBattles]);

  const firstMainRound = MAIN_LINE.find((r) => rounds.includes(r));

  /** Qui s'affronte dans cette battle, d'après l'officiel puis d'après les picks. */
  function participants(battle) {
    if (battle.contenderAId || battle.contenderBId) {
      return [battle.contenderAId, battle.contenderBId];
    }

    const pick = picks[key(battle.round, battle.slot)];
    if (pick?.contenderAId || pick?.contenderBId) {
      return [pick.contenderAId, pick.contenderBId];
    }

    // Premier tour : on apparie le classement pronostiqué 1-8, 2-7, 3-6, 4-5.
    if (battle.round === firstMainRound && seedFromRanking.length) {
      const size = phaseBattles.filter((b) => b.round === battle.round).length * 2;
      const pool = seedFromRanking.slice(0, size);
      return [pool[battle.slot] ?? null, pool[size - 1 - battle.slot] ?? null];
    }

    // Petite finale : les places 3 et 4 du classement pronostiqué (format crew).
    if (battle.round === 'SMALL_FINAL' && !rounds.includes('SEMI') && seedFromRanking.length) {
      return [seedFromRanking[2] ?? null, seedFromRanking[3] ?? null];
    }
    if (battle.round === 'FINAL' && !rounds.includes('SEMI') && seedFromRanking.length) {
      return [seedFromRanking[0] ?? null, seedFromRanking[1] ?? null];
    }

    // Tour suivant : les vainqueurs pronostiqués du tour précédent.
    const prevIndex = MAIN_LINE.indexOf(battle.round) - 1;
    if (battle.round === 'SMALL_FINAL' && rounds.includes('SEMI')) {
      return [0, 1].map((s) => {
        const semi = picks[key('SEMI', s)];
        if (!semi?.winnerId) return null;
        const [a, b] = resolvedPair('SEMI', s);
        return semi.winnerId === a ? b : a; // le perdant
      });
    }
    if (prevIndex >= 0) {
      const prev = MAIN_LINE[prevIndex];
      return [picks[key(prev, battle.slot * 2)]?.winnerId ?? null,
              picks[key(prev, battle.slot * 2 + 1)]?.winnerId ?? null];
    }
    return [null, null];
  }

  function resolvedPair(round, slot) {
    const b = phaseBattles.find((x) => x.round === round && x.slot === slot);
    return b ? participants(b) : [null, null];
  }

  function setPick(battle, patch) {
    const [a, b] = participants(battle);
    const k = key(battle.round, battle.slot);
    onChange({
      ...picks,
      [k]: {
        phaseId: phase.id,
        round: battle.round,
        slot: battle.slot,
        contenderAId: a,
        contenderBId: b,
        ...picks[k],
        ...patch,
        // on resynchronise toujours l'affiche courante
        ...(a || b ? { contenderAId: a, contenderBId: b } : {}),
      },
    });
  }

  return (
    <div className="rounds">
      {rounds.map((round) => {
        const battles = phaseBattles
          .filter((b) => b.round === round)
          .sort((x, y) => x.slot - y.slot);

        return (
          <section className="round" key={round}>
            <h4 className="round__title">{ROUND_LABEL[round] ?? round}</h4>

            {battles.map((battle) => {
              const [aId, bId] = participants(battle);
              const pick = picks[key(battle.round, battle.slot)] ?? {};
              const ready = Boolean(aId && bId);

              return (
                <div className="battle" key={battle.id ?? key(battle.round, battle.slot)}>
                  {battle.label && (
                    <p className="eyebrow" style={{ padding: '0.4rem 0.65rem 0', margin: 0 }}>
                      {battle.label}
                    </p>
                  )}

                  {[aId, bId].map((id, side) => {
                    const c = byId.get(id);
                    const won = pick.winnerId && pick.winnerId === id;
                    return (
                      <button
                        key={side}
                        type="button"
                        className={`battle__side${won ? ' battle__side--won' : ''}`}
                        disabled={locked || !ready}
                        onClick={() => setPick(battle, { winnerId: id })}
                      >
                        <span className="battle__seed">{c?.seed ?? '—'}</span>
                        <span className="battle__name">
                          {c?.name ?? <em className="faint">à déterminer</em>}
                        </span>
                        {won && <span className="tag tag--accent">Vainqueur</span>}
                      </button>
                    );
                  })}

                  {ready && (
                    <div className="battle__foot">
                      <label htmlFor={`sc-${battle.round}-${battle.slot}`}>Score</label>
                      <select
                        id={`sc-${battle.round}-${battle.slot}`}
                        disabled={locked}
                        value={
                          pick.scoreA == null ? '' : `${pick.scoreA}-${pick.scoreB}`
                        }
                        onChange={(e) => {
                          const found = SCORES.find(
                            (s) => `${s.a}-${s.b}` === e.target.value
                          );
                          setPick(battle, { scoreA: found?.a ?? null, scoreB: found?.b ?? null });
                        }}
                      >
                        {SCORES.map((s) => (
                          <option key={s.label} value={s.a == null ? '' : `${s.a}-${s.b}`}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {pick.winnerId && (
                        <button
                          className="btn btn--small btn--ghost"
                          disabled={locked}
                          onClick={() => setPick(battle, { winnerId: null })}
                        >
                          Effacer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
