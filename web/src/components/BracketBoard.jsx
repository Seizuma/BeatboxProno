import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { contenderPhoto } from '../lib/media.js';
import ArtistFigure from './ArtistFigure.jsx';

const MAIN_LINE = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];
const DISPLAY_ORDER = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];
// L'ordre dans lequel les affiches se déduisent les unes des autres : la petite
// finale a besoin des demies, la finale aussi.
const RESOLVE_ORDER = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

/** Splits de votes proposés — 3 juges, ou 5 pour les grosses finales. */
const SCORES = [
  { label: null, a: null, b: null }, // « sans avis », libellé traduit au rendu
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
 * L'arbre. Chaque colonne occupe toute la hauteur et répartit ses affiches en
 * `space-around` : avec deux fois moins d'affiches qu'au tour précédent, chaque
 * battle se retrouve exactement à mi-hauteur des deux qui l'alimentent.
 *
 * L'affiche d'une battle n'est JAMAIS lue depuis le pronostic enregistré : elle
 * se recalcule à chaque rendu depuis le classement pronostiqué et les vainqueurs
 * des tours précédents. Le pronostic ne mémorise qu'un choix (vainqueur, score),
 * pas la structure du tableau — sinon modifier son top 8 après avoir enregistré
 * laisserait l'arbre figé sur l'ancienne disposition.
 *
 * @param {object[]} phaseBattles  squelette officiel {round, slot, contenderAId, contenderBId, label}
 * @param {object}   picks         { "ROUND:SLOT": {contenderAId, contenderBId, winnerId, scoreA, scoreB} }
 * @param {string[]} seedFromRanking  ordre pronostiqué de la phase précédente
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
  const { t } = useI18n();
  const byId = useMemo(() => new Map(contenders.map((c) => [c.id, c])), [contenders]);

  const rounds = useMemo(() => {
    const present = [...new Set(phaseBattles.map((b) => b.round))];
    return DISPLAY_ORDER.filter((r) => present.includes(r));
  }, [phaseBattles]);

  /**
   * Les colonnes du tableau. Un tour = une colonne, sauf les deux finales :
   * elles partagent la dernière, la grande au centre face aux demies et la
   * petite en dessous. C'est la disposition des tableaux de compétition — la
   * petite finale n'est pas un tour de plus, c'est un match annexe.
   */
  const columns = useMemo(() => {
    const present = new Set(rounds);
    const cols = [];
    for (const r of ['ROUND_OF_16', 'QUARTER', 'SEMI']) {
      if (present.has(r)) cols.push({ key: r, main: r, extra: null });
    }
    if (present.has('FINAL') || present.has('SMALL_FINAL')) {
      cols.push({
        key: 'FINALS',
        main: present.has('FINAL') ? 'FINAL' : 'SMALL_FINAL',
        extra: present.has('FINAL') && present.has('SMALL_FINAL') ? 'SMALL_FINAL' : null,
      });
    }
    if (present.has('LEGACY')) cols.push({ key: 'LEGACY', main: 'LEGACY', extra: null });
    return cols;
  }, [rounds]);

  const battlesOf = useMemo(() => {
    const map = {};
    for (const b of phaseBattles) (map[b.round] ??= []).push(b);
    for (const list of Object.values(map)) list.sort((x, y) => x.slot - y.slot);
    return map;
  }, [phaseBattles]);

  /* -------------------------------------------------------------------------
     La résolution de l'arbre, en une passe, du premier tour vers la finale.

     Pour chaque affiche on établit dans cet ordre :
       1. la paire officielle si l'organisateur l'a déjà publiée ;
       2. sinon la paire déduite — classement pronostiqué au premier tour,
          vainqueurs pronostiqués ensuite ;
       3. le vainqueur choisi, mais seulement s'il fait toujours partie de la
          paire. Sinon il tombe, et le score avec lui : un choix qui portait sur
          une affiche qui n'existe plus n'a plus de sens.
     ------------------------------------------------------------------------- */
  const resolved = useMemo(() => {
    const out = new Map();
    const firstMainRound = MAIN_LINE.find((r) => rounds.includes(r));
    const hasSemi = rounds.includes('SEMI');

    const pairOf = (round, slot) => out.get(key(round, slot)) ?? null;

    for (const round of RESOLVE_ORDER) {
      for (const battle of battlesOf[round] ?? []) {
        let a = null;
        let b = null;

        if (battle.contenderAId || battle.contenderBId) {
          // 1. L'organisateur a publié l'affiche : elle fait foi.
          a = battle.contenderAId ?? null;
          b = battle.contenderBId ?? null;
        } else if (round === firstMainRound && seedFromRanking.length) {
          // 2a. Premier tour : on apparie le classement 1-8, 2-7, 3-6, 4-5.
          const size = (battlesOf[round]?.length ?? 0) * 2;
          const pool = seedFromRanking.slice(0, size);
          a = pool[battle.slot] ?? null;
          b = pool[size - 1 - battle.slot] ?? null;
        } else if (round === 'SMALL_FINAL' && hasSemi) {
          // 2b. Petite finale : les perdants des demies.
          [a, b] = [0, 1].map((slot) => {
            const semi = pairOf('SEMI', slot);
            if (!semi?.winnerId) return null;
            return semi.winnerId === semi.a ? semi.b : semi.a;
          });
        } else if (round === 'SMALL_FINAL' && seedFromRanking.length) {
          // 2c. Format sans demies : les places 3 et 4 du classement.
          a = seedFromRanking[2] ?? null;
          b = seedFromRanking[3] ?? null;
        } else if (round === 'FINAL' && !hasSemi && seedFromRanking.length) {
          a = seedFromRanking[0] ?? null;
          b = seedFromRanking[1] ?? null;
        } else {
          // 2d. Tour suivant : les vainqueurs pronostiqués du tour précédent.
          const prev = MAIN_LINE[MAIN_LINE.indexOf(round) - 1];
          if (prev) {
            a = pairOf(prev, battle.slot * 2)?.winnerId ?? null;
            b = pairOf(prev, battle.slot * 2 + 1)?.winnerId ?? null;
          }
        }

        // 3. Le choix enregistré ne survit que s'il porte sur cette affiche.
        const pick = picks[key(round, battle.slot)];
        const stillValid = pick?.winnerId && (pick.winnerId === a || pick.winnerId === b);
        const winnerId = stillValid ? pick.winnerId : null;

        out.set(key(round, battle.slot), {
          round,
          slot: battle.slot,
          a,
          b,
          winnerId,
          scoreA: winnerId ? pick?.scoreA ?? null : null,
          scoreB: winnerId ? pick?.scoreB ?? null : null,
        });
      }
    }
    return out;
  }, [battlesOf, rounds, picks, seedFromRanking]);

  /* -------------------------------------------------------------------------
     Remonter le ménage au parent. L'affichage est déjà correct sans cela, mais
     sans ce nettoyage le pronostic enregistré garderait des choix orphelins :
     des vainqueurs désignés sur des affiches qui n'existent plus.
     ------------------------------------------------------------------------- */
  const lastPushed = useRef(null);

  useEffect(() => {
    if (locked) return;

    const next = {};
    for (const [k, r] of resolved) {
      if (!r.a && !r.b) continue; // affiche encore indéterminée : rien à retenir
      next[k] = {
        phaseId: phase.id,
        round: r.round,
        slot: r.slot,
        contenderAId: r.a,
        contenderBId: r.b,
        winnerId: r.winnerId,
        scoreA: r.scoreA,
        scoreB: r.scoreB,
      };
    }

    // Comparaison insensible à l'ordre des clés : le pronostic rechargé depuis
    // le serveur arrive dans l'ordre de la base, pas dans celui de l'arbre.
    const stable = (obj) =>
      JSON.stringify(Object.keys(obj).sort().map((k) => [k, obj[k]]));

    const signature = stable(next);
    // Deux garde-fous contre la boucle : on ne remonte que si le contenu diffère
    // vraiment de ce qu'on a déjà en état, et jamais deux fois la même valeur.
    if (signature === stable(picks) || signature === lastPushed.current) return;
    lastPushed.current = signature;
    onChange(next);
  }, [resolved, picks, onChange, phase.id, locked]);

  function setPick(round, slot, patch) {
    const r = resolved.get(key(round, slot));
    if (!r) return;
    onChange({
      ...picks,
      [key(round, slot)]: {
        phaseId: phase.id,
        round,
        slot,
        contenderAId: r.a,
        contenderBId: r.b,
        winnerId: r.winnerId,
        scoreA: r.scoreA,
        scoreB: r.scoreB,
        ...patch,
      },
    });
  }

  /** Une colonne se dessine par paires quand la suivante en compte moitié moins. */
  const pairing = useMemo(() => {
    const map = {};
    columns.forEach((col, i) => {
      const next = columns[i + 1];
      const mine = battlesOf[col.main]?.length ?? 0;
      const theirs = next ? battlesOf[next.main]?.length ?? 0 : 0;
      map[col.key] = {
        paired: Boolean(next) && mine >= 2 && mine === theirs * 2,
        fed: i > 0 && map[columns[i - 1].key]?.paired,
      };
    });
    return map;
  }, [columns, battlesOf]);

  function renderBattle(battle) {
    const r = resolved.get(key(battle.round, battle.slot));
    if (!r) return null;
    const ready = Boolean(r.a && r.b);

    return (
      <div className="bracket__node" key={battle.id ?? key(battle.round, battle.slot)}>
        <div className={`battle${r.winnerId ? ' battle--called' : ''}`}>
          {battle.label && <p className="battle__label">{battle.label}</p>}

          {[r.a, r.b].map((id, side) => {
            const c = byId.get(id);
            const won = r.winnerId && r.winnerId === id;
            return (
              <button
                key={side}
                type="button"
                className={`battle__side${won ? ' battle__side--won' : ''}`}
                disabled={locked || !ready}
                onClick={() => setPick(battle.round, battle.slot, { winnerId: id })}
              >
                <ArtistFigure src={contenderPhoto(c)} name={c?.name} size="xs" />
                <span className="battle__name">
                  {c?.name ?? <em className="faint">{t('bracket.tbd')}</em>}
                </span>
                <span className="battle__seed">{c?.seed ?? '—'}</span>
              </button>
            );
          })}

          {ready && (
            <div className="battle__foot">
              <label htmlFor={`sc-${phase.id}-${battle.round}-${battle.slot}`}>
                {t('bracket.score')}
              </label>
              <select
                id={`sc-${phase.id}-${battle.round}-${battle.slot}`}
                disabled={locked}
                value={r.scoreA == null ? '' : `${r.scoreA}-${r.scoreB}`}
                onChange={(e) => {
                  const found = SCORES.find((s) => `${s.a}-${s.b}` === e.target.value);
                  setPick(battle.round, battle.slot, {
                    scoreA: found?.a ?? null,
                    scoreB: found?.b ?? null,
                  });
                }}
              >
                {SCORES.map((s) => (
                  <option key={s.label ?? 'none'} value={s.a == null ? '' : `${s.a}-${s.b}`}>
                    {s.label ?? t('bracket.score.none')}
                  </option>
                ))}
              </select>
              {r.winnerId && (
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={locked}
                  onClick={() => setPick(battle.round, battle.slot, { winnerId: null })}
                >
                  {t('bracket.clear')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bracket">
      {columns.map((col) => {
        const battles = battlesOf[col.main] ?? [];
        const extras = col.extra ? battlesOf[col.extra] ?? [] : [];
        const { paired, fed } = pairing[col.key] ?? {};

        const pairs = [];
        if (paired) {
          for (let i = 0; i < battles.length; i += 2) pairs.push(battles.slice(i, i + 2));
        }

        return (
          <section className="bracket__round" key={col.key}>
            <h4 className="bracket__title">{t(`bracket.round.${col.main}`)}</h4>

            <div
              className={
                'bracket__col' +
                (col.key === 'FINALS' ? ' bracket__col--finals' : '') +
                (fed ? ' bracket__col--fed' : '')
              }
            >
              {paired
                ? pairs.map((pair, i) => (
                  <div className="bracket__pair" key={i}>
                    {pair.map(renderBattle)}
                  </div>
                ))
                : battles.map(renderBattle)}

              {/* La petite finale : sous la grande, dans la même colonne, et
                  sans trait de liaison — elle ne mène nulle part. */}
              {extras.length > 0 && (
                <div className="bracket__annex">
                  <h5 className="bracket__subtitle">{t(`bracket.round.${col.extra}`)}</h5>
                  {extras.map(renderBattle)}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}