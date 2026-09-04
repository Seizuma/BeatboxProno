import { useMemo } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { contenderPhoto } from '../lib/media.js';
import ArtistFigure from './ArtistFigure.jsx';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const ROUND_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

const key = (round, slot) => `${round}:${slot}`;

/**
 * Le résultat officiel d'une phase, face au pronostic du joueur.
 *
 * ─── Pourquoi sur la page événement ─────────────────────────────────────────
 *
 * Une fois la compète jouée, la page événement n'avait plus rien à dire : elle
 * continuait d'afficher un éditeur verrouillé, c'est-à-dire son propre
 * pronostic figé, sans jamais montrer ce qui s'était réellement passé. Le score
 * tombait sur la fiche de résultat, ailleurs, et il fallait le croire sur
 * parole. Or c'est précisément le moment où l'on revient sur la page : pour
 * voir ce qu'on avait deviné.
 *
 * ─── Ce que ce composant montre, et ce qu'il ne montre pas ──────────────────
 *
 * Le résultat, et l'écart. Pas les points : ils ont leur propre écran, avec le
 * détail du barème, et les recopier ici obligerait à tenir deux calculs
 * d'accord. Ce qu'on apporte est plus simple et n'existe nulle part ailleurs —
 * la ligne à ligne entre ce que le joueur a annoncé et ce qui est arrivé.
 *
 * ─── Il ne porte pas son propre titre ───────────────────────────────────────
 *
 * Il est monté dans une fenêtre, qui l'annonce déjà avec la catégorie et la
 * phase. Le répéter en tête du contenu ferait lire deux fois la même chose à
 * trois centimètres d'intervalle. Le compteur, lui, reste : « 8/8 qualifiés
 * trouvés » est un résultat, pas un intitulé.
 *
 * ─── La condition d'affichage est `resolved`, pas la fin de l'événement ─────
 *
 * Une compète publie ses phases une à une : les wildcards tombent des semaines
 * avant le tableau. Attendre la fin ferait taire la page pendant tout ce
 * temps, alors que c'est justement là que la comparaison intéresse le plus.
 * La censure côté serveur garantit qu'une phase non publiée n'expose ni rangs
 * ni vainqueurs, donc `resolved` est aussi la seule condition sous laquelle il
 * y a quelque chose à lire.
 */
export default function PhaseResult({ phase, contenders, order, picks }) {
    const { t } = useI18n();

    const byId = useMemo(
        () => new Map((contenders ?? []).map((c) => [c.id, c])),
        [contenders]
    );

    if (!phase?.resolved) return null;

    const isRanking = RANKING_TYPES.includes(phase.type);
    return isRanking ? (
        <RankingResult phase={phase} byId={byId} order={order ?? []} t={t} />
    ) : (
        <BracketResult phase={phase} byId={byId} picks={picks ?? {}} t={t} />
    );
}

/* ---------------------------------------------------------------------------
   Classements
   --------------------------------------------------------------------------- */

function RankingResult({ phase, byId, order, t }) {
    const official = (phase.entries ?? [])
        .filter((e) => e.rank != null)
        .slice()
        .sort((a, b) => a.rank - b.rank);

    if (official.length === 0) return <p className="empty">{t('result.empty')}</p>;

    const cut = phase.qualifierCount ?? null;
    // Le rang pronostiqué : la position dans MA liste, pas un champ enregistré.
    // C'est la même définition que celle qu'utilise le calcul des points, et la
    // dériver ici évite d'avoir à la transporter.
    const myRank = (id) => {
        const i = order.indexOf(id);
        return i < 0 ? null : i + 1;
    };

    // Les qualifiés que j'avais mis au-dessus de la ligne. La mesure qui compte
    // sur une sélection : deviner QUI passe, avant de deviner dans quel ordre.
    const qualified = official.filter((e) => (cut ? e.qualified : false));
    const found = cut
        ? qualified.filter((e) => {
            const r = myRank(e.contenderId);
            return r != null && r <= cut;
        }).length
        : null;

    // Ceux que j'ai classés et qui ne figurent nulle part au résultat. Sur une
    // wildcard c'est le cas le plus fréquent — on annonce des gens qui n'ont
    // même pas envoyé de vidéo — et les taire donnerait une comparaison
    // flatteuse : seuls mes bons paris seraient visibles.
    const inResult = new Set(official.map((e) => e.contenderId));
    const ghosts = order.filter((id) => !inResult.has(id));

    return (
        <div className="stack" style={{ gap: '0.6rem' }}>
            {found != null && (
                <p className="row" style={{ margin: 0, justifyContent: 'flex-end' }}>
                    <span className="tag tag--done">
                        {t('result.hits', { n: found, total: qualified.length })}
                    </span>
                </p>
            )}

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr>
                            <th className="num">{t('result.col.rank')}</th>
                            <th>{t('result.col.artist')}</th>
                            <th className="num">{t('result.col.mine')}</th>
                            <th className="num">{t('result.col.gap')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {official.map((e) => {
                            const c = byId.get(e.contenderId);
                            const mine = myRank(e.contenderId);
                            const gap = mine == null ? null : mine - e.rank;
                            return (
                                <tr key={e.contenderId}>
                                    <td className="num data">{e.rank}</td>
                                    <td>
                                        <span className="stat-row">
                                            <ArtistFigure src={c ? contenderPhoto(c) : null} name={c?.name ?? '—'} size="xs" />
                                            <span>
                                                {c?.name ?? '—'}
                                                {cut != null && e.qualified && (
                                                    <span className="faint data" style={{ fontSize: '0.78rem', display: 'block' }}>
                                                        {t('result.qualified')}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="num data">
                                        {mine ?? <span className="faint">{t('result.notRanked')}</span>}
                                    </td>
                                    <td
                                        className="num data"
                                        // Zéro se lit en vert, le reste en gris : ce qu'on cherche
                                        // du regard est la ligne tombée juste, pas l'ampleur des
                                        // erreurs. Colorer les écarts par gravité ferait un
                                        // dégradé où rien ne ressort.
                                        style={{ color: gap === 0 ? 'var(--ok)' : undefined }}
                                    >
                                        {gap == null ? '—' : gap === 0 ? '=' : gap > 0 ? `+${gap}` : gap}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {ghosts.length > 0 && (
                <p className="faint" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {t('result.ghosts')}{' '}
                    <span className="data">
                        {ghosts.map((id) => byId.get(id)?.name).filter(Boolean).join(' · ')}
                    </span>
                </p>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------------
   Tableaux
   --------------------------------------------------------------------------- */

/**
 * Une affiche jouée, face à celle qu'on avait annoncée.
 *
 * Trois verdicts indépendants, dans l'ordre où ils se méritent : avoir vu
 * l'affiche, avoir vu le vainqueur, avoir vu le score. Les afficher séparément
 * plutôt qu'en un « juste / faux » unique, parce que deviner que Alem
 * affronterait Colaps est une réussite même si le vainqueur était l'autre.
 */
function BracketResult({ phase, byId, picks, t }) {
    const played = (phase.battles ?? []).filter((b) => b.played && b.winnerId);
    if (played.length === 0) return <p className="empty">{t('result.empty')}</p>;

    const rounds = ROUND_ORDER.filter((r) => played.some((b) => b.round === r));
    const name = (id) => (id ? byId.get(id)?.name ?? '—' : '—');

    let winners = 0;
    for (const b of played) {
        if (picks[key(b.round, b.slot)]?.winnerId === b.winnerId) winners += 1;
    }

    return (
        <div className="stack" style={{ gap: '0.6rem' }}>
            <p className="row" style={{ margin: 0, justifyContent: 'flex-end' }}>
                <span className="tag tag--done">
                    {t('result.winners', { n: winners, total: played.length })}
                </span>
            </p>

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr>
                            <th>{t('result.col.battle')}</th>
                            <th>{t('result.col.official')}</th>
                            <th>{t('result.col.yours')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rounds.map((round) => {
                            const list = played
                                .filter((b) => b.round === round)
                                .sort((a, b) => a.slot - b.slot);
                            return list.map((b, i) => {
                                const mine = picks[key(b.round, b.slot)];
                                const official = [b.contenderAId, b.contenderBId];
                                const sameMatchup =
                                    Boolean(mine?.contenderAId && mine?.contenderBId) &&
                                    official.includes(mine.contenderAId) &&
                                    official.includes(mine.contenderBId);
                                const sameWinner = Boolean(mine?.winnerId) && mine.winnerId === b.winnerId;
                                const sameScore =
                                    sameWinner &&
                                    mine.scoreA != null &&
                                    mine.scoreB != null &&
                                    // Les scores sont saisis dans l'ordre de l'affiche du JOUEUR,
                                    // qui peut avoir inversé A et B. On compare donc le score du
                                    // vainqueur au score du vainqueur, pas la colonne A à la
                                    // colonne A.
                                    scoreOf(mine, mine.winnerId) === scoreOf(b, b.winnerId) &&
                                    scoreOf(mine, other(mine, mine.winnerId)) === scoreOf(b, other(b, b.winnerId));

                                return (
                                    <tr key={b.id}>
                                        <td>
                                            {i === 0 && (
                                                <span className="eyebrow" style={{ display: 'block' }}>
                                                    {t(`bracket.round.${round}`)}
                                                </span>
                                            )}
                                            <span className="data" style={{ fontSize: '0.82rem' }}>
                                                {b.label ?? `#${b.slot + 1}`}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="data" style={{ fontSize: '0.85rem' }}>
                                                {name(b.contenderAId)} — {name(b.contenderBId)}
                                            </span>
                                            <span style={{ display: 'block', color: 'var(--ok)' }}>
                                                {name(b.winnerId)}
                                                {b.scoreA != null && b.scoreB != null && (
                                                    <span className="faint data"> {b.scoreA}–{b.scoreB}</span>
                                                )}
                                            </span>
                                        </td>

                                        <td>
                                            {!mine?.winnerId ? (
                                                <span className="faint">{t('result.noPick')}</span>
                                            ) : (
                                                <>
                                                    <span className="data" style={{ fontSize: '0.85rem' }}>
                                                        {name(mine.contenderAId)} — {name(mine.contenderBId)}
                                                    </span>
                                                    <span
                                                        style={{
                                                            display: 'block',
                                                            color: sameWinner ? 'var(--ok)' : 'var(--r)',
                                                        }}
                                                    >
                                                        {name(mine.winnerId)}
                                                        {mine.scoreA != null && mine.scoreB != null && (
                                                            <span className="faint data"> {mine.scoreA}–{mine.scoreB}</span>
                                                        )}
                                                    </span>
                                                    <span className="row" style={{ gap: '0.25rem', marginTop: '0.2rem' }}>
                                                        {sameMatchup && <span className="tag">{t('result.hit.matchup')}</span>}
                                                        {sameWinner && <span className="tag tag--done">{t('result.hit.winner')}</span>}
                                                        {sameScore && <span className="tag tag--done">{t('result.hit.score')}</span>}
                                                    </span>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** Le score du camp `id` dans une affiche, quel que soit le côté où il est. */
function scoreOf(battle, id) {
    if (!id) return null;
    if (battle.contenderAId === id) return battle.scoreA ?? null;
    if (battle.contenderBId === id) return battle.scoreB ?? null;
    return null;
}

/** L'autre camp d'une affiche. */
function other(battle, id) {
    return battle.contenderAId === id ? battle.contenderBId : battle.contenderAId;
}