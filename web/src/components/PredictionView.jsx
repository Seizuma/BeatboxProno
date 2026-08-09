import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';
import ArtistFigure from './ArtistFigure.jsx';

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];
const ROUND_LABELS = {
    ROUND_OF_16: 'ROUND_OF_16',
    QUARTER: 'QUARTER',
    SEMI: 'SEMI',
    SMALL_FINAL: 'SMALL_FINAL',
    FINAL: 'FINAL',
    LEGACY: 'LEGACY',
};

/**
 * Le pronostic de quelqu'un, en lecture seule.
 *
 * Ne s'ouvre que sur un pronostic déposé — le serveur refuse les brouillons
 * d'autrui. On y voit ce que la personne avait annoncé : ses classements et
 * ses vainqueurs, dans l'ordre des phases.
 */
export default function PredictionView({ predictionId, onClose }) {
    const { t, date } = useI18n();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setData(null);
        setError(null);
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
                    <button className="btn btn--small" onClick={onClose} style={{ marginLeft: 'auto' }}>
                        {t('draft.close')}
                    </button>
                </>
            }
        >
            {error && <p className="notice">{error}</p>}
            {!data && !error && <p className="faint">{t('common.loading')}</p>}

            {data && <Body prediction={data} />}
        </Modal>
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
        const battles = prediction.battles
            .filter((b) => b.phaseId === phase.id && b.winnerId)
            .sort((a, b) => a.round.localeCompare(b.round) || a.slot - b.slot);
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
                        <h3>
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
                                                <tr key={r.contenderId}>
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
                            <div className="panel panel--flush">
                                <table>
                                    <tbody>
                                        {battles.map((b) => {
                                            const a = byId.get(b.contenderAId);
                                            const bb = byId.get(b.contenderBId);
                                            const winner = byId.get(b.winnerId);
                                            return (
                                                <tr key={`${b.round}:${b.slot}`}>
                                                    <td className="muted data" style={{ whiteSpace: 'nowrap' }}>
                                                        {t(`bracket.round.${ROUND_LABELS[b.round] ?? b.round}`)}
                                                    </td>
                                                    <td>
                                                        {a?.name ?? '—'} <span className="faint">vs</span> {bb?.name ?? '—'}
                                                    </td>
                                                    <td style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                                                        ► {winner?.name ?? '—'}
                                                    </td>
                                                    <td className="num muted">
                                                        {b.scoreA == null ? '—' : `${b.scoreA} – ${b.scoreB}`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                );
            })}
        </>
    );
}