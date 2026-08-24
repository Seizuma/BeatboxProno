import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';
import ArtistFigure from './ArtistFigure.jsx';
import PredictionComments from './PredictionComments.jsx';
import ExportPrediction from './ExportPrediction.jsx';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];

/**
 * Le pronostic de quelqu'un, en lecture seule.
 *
 * Ne s'ouvre que sur un pronostic déposé — le serveur refuse les brouillons
 * d'autrui. On y voit ce que la personne avait annoncé : ses classements et
 * ses vainqueurs, dans l'ordre des phases.
 */
export default function PredictionView({ predictionId, onClose, groupSlug, groupName }) {
    const { t, date } = useI18n();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [placing, setPlacing] = useState(false);
    const [exporting, setExporting] = useState(false);

    // La boîte annotée : c'est elle qui porte `position: relative`, donc
    // l'origine du repère dans lequel les pastilles de commentaire se placent.
    const canvas = useRef(null);

    useEffect(() => {
        setData(null);
        setError(null);
        setPlacing(false);
        setExporting(false);
        api
            .get(`/predictions/${predictionId}`)
            .then(({ prediction }) => setData(prediction))
            .catch((e) => setError(e.message));
    }, [predictionId]);

    const who = data?.user?.globalName ?? data?.user?.username ?? '';

    return (
        <Modal
            wide
            title={data ? `${data.event.name} ${data.event.year} — ${data.category.name}` : t('common.loading')}
            subtitle={data ? who : undefined}
            onClose={onClose}
            footer={
                <>
                    {data?.scoredAt && (
                        <span className="readout">
                            <span className="readout__value">{data.points}</span>
                            <span className="readout__unit">{t('common.points')}</span>
                        </span>
                    )}
                    <span className="faint" style={{ fontSize: '0.85rem' }}>
                        {data?.label}
                        {data?.updatedAt && ` · ${date(data.updatedAt)}`}
                    </span>
                    {data && (
                        <button className="btn btn--small" onClick={() => setExporting(true)}>
                            {t('export.open')}
                        </button>
                    )}

                    {/* Le mode pose. Un interrupteur plutôt qu'un clic droit ou
                        un appui long : sur mobile ces deux gestes appartiennent
                        déjà au navigateur. */}
                    {data && groupSlug && (
                        <button
                            className={`btn btn--small${placing ? ' btn--primary' : ''}`}
                            onClick={() => setPlacing((v) => !v)}
                        >
                            {placing ? t('pin.mode.on') : t('pin.mode')}
                        </button>
                    )}

                    <button className="btn btn--small" onClick={onClose} style={{ marginLeft: 'auto' }}>
                        {t('draft.close')}
                    </button>
                </>
            }
        >
            {error && <p className="notice">{error}</p>}
            {!data && !error && <p className="faint">{t('common.loading')}</p>}

            {placing && <p className="notice notice--ok">{t('pin.mode.hint')}</p>}

            {data && (
                <div ref={canvas} className={`canvas${placing ? ' canvas--placing' : ''}`}>
                    <Body prediction={data} />

                    {groupSlug && (
                        <PredictionComments
                            predictionId={predictionId}
                            groupSlug={groupSlug}
                            groupName={groupName}
                            canvasRef={canvas}
                            placing={placing}
                            onPlacingEnd={() => setPlacing(false)}
                        />
                    )}
                </div>
            )}

            {exporting && data && (
                <ExportPrediction prediction={data} onClose={() => setExporting(false)} />
            )}
        </Modal>
    );
}

/**
 * L'ordre des tours, tour de 32 compris.
 *
 * Ajouter une valeur ici ne suffit pas à faire exister le format : il faut
 * aussi qu'elle figure dans `MAIN_LINE` de `bracket.js`, qui décide de ce qui
 * alimente quoi, et dans le type énuméré de la base. Les trois doivent rester
 * d'accord.
 */
const ROUND_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY'];

/**
 * L'arbre d'un pronostic, en lecture seule.
 *
 * Reprend la géométrie de l'éditeur : une colonne par tour, réparties en
 * `space-around` pour que chaque battle tombe à mi-hauteur des deux qui
 * l'alimentent, et les deux finales dans la même colonne. Une liste à plat
 * ne dit rien du chemin parcouru — or c'est précisément ce qu'on vient lire.
 */
function ReadOnlyBracket({ battles, byId, photo }) {
    const { t } = useI18n();

    const byRound = {};
    for (const b of battles) (byRound[b.round] ??= []).push(b);
    for (const list of Object.values(byRound)) list.sort((x, y) => x.slot - y.slot);

    const present = ROUND_ORDER.filter((r) => byRound[r]);
    const columns = [];
    for (const r of ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI']) {
        if (present.includes(r)) columns.push({ key: r, main: r, extra: null });
    }
    if (present.includes('FINAL') || present.includes('SMALL_FINAL')) {
        columns.push({
            key: 'FINALS',
            main: present.includes('FINAL') ? 'FINAL' : 'SMALL_FINAL',
            extra: present.includes('FINAL') && present.includes('SMALL_FINAL') ? 'SMALL_FINAL' : null,
        });
    }
    if (present.includes('LEGACY')) columns.push({ key: 'LEGACY', main: 'LEGACY', extra: null });

    const card = (b) => {
        const sides = [b.contenderAId, b.contenderBId];
        return (
            <div
                className="bracket__node"
                key={`${b.round}:${b.slot}`}
                data-anchor={`battle:${b.phaseId}:${b.round}:${b.slot}`}
            >
                <div className="battle battle--called">
                    {sides.map((id, i) => {
                        const c = byId.get(id);
                        const won = b.winnerId === id;
                        return (
                            <div key={i} className={`battle__side${won ? ' battle__side--won' : ''}`}>
                                <ArtistFigure src={photo(c)} name={c?.name} size="xs" />
                                <span className="battle__name">{c?.name ?? '—'}</span>
                                <span className="battle__seed">
                                    {b.scoreA == null ? '' : i === 0 ? b.scoreA : b.scoreB}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="bracket" style={{ '--cols': columns.length }}>
            {columns.map((col, i) => {
                const list = byRound[col.main] ?? [];
                const extras = col.extra ? byRound[col.extra] ?? [] : [];
                const next = columns[i + 1];
                const paired = Boolean(next) && list.length >= 2 && list.length === (byRound[next.main] ?? []).length * 2;
                const fed = i > 0;

                const pairs = [];
                if (paired) for (let k = 0; k < list.length; k += 2) pairs.push(list.slice(k, k + 2));

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
                                ? pairs.map((pair, k) => (
                                    <div className="bracket__pair" key={k}>
                                        {pair.map(card)}
                                    </div>
                                ))
                                : list.map(card)}

                            {extras.length > 0 && (
                                <div className="bracket__annex">
                                    <h5 className="bracket__subtitle">{t(`bracket.round.${col.extra}`)}</h5>
                                    {extras.map(card)}
                                </div>
                            )}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function Body({ prediction }) {
    const { t } = useI18n();
    const byId = new Map(prediction.category.contenders.map((c) => [c.id, c]));
    const photo = (c) => c?.imageUrl ?? c?.artists?.[0]?.artist?.imageUrl ?? null;

    const sections = prediction.category.phases.map((phase) => {
        if (RANKING_TYPES.includes(phase.type)) {
            const ranks = prediction.ranks
                .filter((r) => r.phaseId === phase.id)
                .sort((a, b) => a.rank - b.rank);
            return { phase, kind: 'ranking', ranks };
        }
        const battles = prediction.battles.filter(
            (b) => b.phaseId === phase.id && (b.winnerId || b.contenderAId)
        );
        return { phase, kind: 'bracket', battles };
    });

    const empty = sections.every((s) =>
        s.kind === 'ranking' ? s.ranks.length === 0 : s.battles.length === 0
    );
    if (empty) return <p className="empty">{t('draft.empty')}</p>;

    return (
        <>
            {sections.map(({ phase, kind, ranks, battles }) => {
                if (kind === 'ranking' && ranks.length === 0) return null;
                if (kind === 'bracket' && battles.length === 0) return null;

                return (
                    <section className="stack" key={phase.id} style={{ gap: '0.5rem' }}>
                        {/* Le titre de phase est accrochable : c'est là qu'on
                            pose « il a complètement raté ses wildcards ». */}
                        <h3 data-anchor={`phase:${phase.id}`}>
                            {phase.name}
                            {phase.qualifierCount ? ` — ${t('ranking.cut', { n: phase.qualifierCount })}` : ''}
                        </h3>

                        {kind === 'ranking' ? (
                            <div className="panel panel--flush">
                                <table>
                                    <tbody>
                                        {ranks.map((r) => {
                                            const c = byId.get(r.contenderId);
                                            const qualified = phase.qualifierCount && r.rank <= phase.qualifierCount;
                                            return (
                                                <tr
                                                    key={r.contenderId}
                                                    data-anchor={`rank:${phase.id}:${r.contenderId}`}
                                                >
                                                    <td className="rank-cell">{r.rank}</td>
                                                    <td>
                                                        <span className="stat-row">
                                                            <ArtistFigure src={photo(c)} name={c?.name} size="xs" />
                                                            <span style={{ color: qualified ? 'var(--ok)' : undefined }}>
                                                                {c?.name ?? '—'}
                                                            </span>
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <ReadOnlyBracket battles={battles} byId={byId} photo={photo} />
                        )}
                    </section>
                );
            })}
        </>
    );
}