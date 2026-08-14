import { useEffect, useMemo } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { contenderPhoto } from '../lib/media.js';
import { splitsForWinner, judgesFor } from '../lib/scores.js';
import { resolveBracket, bracketKey as key, bracketSignature as stable } from '../lib/bracket.js';
import ArtistFigure from './ArtistFigure.jsx';

const DISPLAY_ORDER = ['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

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
 * @param {boolean}  authoritative  vue organisateur : l'affiche enregistrée en
 *   base EST l'officiel, elle prime toujours. Côté joueur c'est l'inverse —
 *   voir `trustsOfficial` plus bas.
 */
export default function BracketBoard({
  phase,
  phaseBattles,
  contenders,
  picks,
  onChange,
  locked,
  seedFromRanking = [],
  event,
  authoritative = false,
}) {
  const { t } = useI18n();
  // Les splits proposables découlent du panel de juges : inutile d'offrir un
  // 5-0 sur une compète jugée à trois.
  const judges = judgesFor(phase, event);
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

  // L'arbre résolu. La fonction vit hors du composant : c'est de la logique
  // pure, testable, et c'est elle qui décide de tout ce que l'écran montre.
  const resolved = useMemo(
    () =>
      resolveBracket({
        battlesOf,
        rounds,
        picks,
        seedFromRanking,
        resolvedPhase: phase.resolved,
        authoritative,
      }),
    [battlesOf, rounds, picks, seedFromRanking, phase.resolved, authoritative]
  );

  /* -------------------------------------------------------------------------
     Remonter le ménage au parent. L'affichage est déjà correct sans cela, mais
     sans ce nettoyage le pronostic enregistré garderait des choix orphelins :
     des vainqueurs désignés sur des affiches qui n'existent plus.
     ------------------------------------------------------------------------- */
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

    // Une seule condition d'arrêt : l'état du parent dit déjà la même chose que
    // l'arbre affiché. Il n'en faut pas d'autre, parce que la résolution est
    // idempotente — repasser `next` dans le moulin redonne `next`.
    //
    // Il y avait ici un second garde-fou, une ref mémorisant la dernière
    // signature poussée, censé couper les boucles. Il coupait surtout la
    // remontée légitime : dès qu'on revenait à un état déjà vu — effacer un
    // vainqueur puis le redésigner, par exemple — la ref bloquait l'envoi et
    // l'état du parent restait figé sur l'arbre PRÉCÉDENT. L'affichage, lui,
    // se recalculait : d'où un arbre correct à l'écran mais un pronostic
    // enregistré qui disait autre chose, et des choix qui « revenaient ».
    if (stable(next) === stable(picks)) return;
    onChange(next);
  }, [resolved, picks, onChange, phase.id, locked]);

  /** Efface tous les vainqueurs de la phase, sans toucher au classement amont. */
  function clearAll() {
    const next = {};
    for (const [k, p] of Object.entries(picks)) {
      next[k] = { ...p, winnerId: null, scoreA: null, scoreB: null };
    }
    onChange(next);
  }

  const called = useMemo(
    () => [...resolved.values()].filter((r) => r.winnerId).length,
    [resolved]
  );

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
    // Seules les répartitions qui donnent la majorité au camp désigné.
    const options = splitsForWinner(judges, r.side);

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

          {/* Le score n'a de sens qu'une fois le vainqueur désigné : tant
              qu'aucun camp n'est choisi, la ligne n'apparaît pas du tout. */}
          {ready && r.winnerId && (
            <div className="battle__foot">
              <label htmlFor={`sc-${phase.id}-${battle.round}-${battle.slot}`}>
                {t('bracket.score')}
              </label>
              <select
                id={`sc-${phase.id}-${battle.round}-${battle.slot}`}
                disabled={locked}
                value={r.scoreA == null ? '' : `${r.scoreA}-${r.scoreB}`}
                onChange={(e) => {
                  const found = options.find((s) => s.value === e.target.value);
                  setPick(battle.round, battle.slot, {
                    scoreA: found?.a ?? null,
                    scoreB: found?.b ?? null,
                  });
                }}
              >
                <option value="">{t('bracket.score.none')}</option>
                {options.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
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
    <>
      {/* Reprendre l'arbre à zéro sans avoir à cliquer « Effacer » sur chaque
          affiche — et sans toucher au classement qui compose le premier tour. */}
      {!locked && called > 0 && (
        <div className="row" style={{ gap: '0.6rem', justifyContent: 'flex-end' }}>
          <span className="faint" style={{ fontSize: '0.82rem' }}>
            {t('bracket.called', { n: called })}
          </span>
          <button type="button" className="btn btn--small btn--ghost" onClick={clearAll}>
            {t('bracket.clearAll')}
          </button>
        </div>
      )}

      {/* Le nombre de colonnes est passé à la CSS : c'est lui qui permet de
          répartir la largeur disponible au lieu de déborder vers la droite. */}
      <div className="bracket" style={{ '--cols': columns.length }}>
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
    </>
  );
}

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