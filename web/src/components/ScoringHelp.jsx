import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';

/**
 * Le barème, expliqué.
 *
 * Il n'est pas évident au premier regard, notamment la règle de l'affiche : on
 * marque des points parce qu'une battle a eu lieu, même si elle s'est jouée
 * ailleurs dans le tableau. Autant le dire clairement plutôt que de laisser
 * chacun le déduire de son score.
 */
export default function ScoringHelp({ onClose }) {
    const { t } = useI18n();

    const rows = [
        ['help.rank.qualified', 'help.rank.qualified.detail', '+1'],
        ['help.rank.gap', 'help.rank.gap.detail', '+1 … +5'],
        ['help.battle.matchup', 'help.battle.matchup.detail', '+2'],
        ['help.battle.winner', 'help.battle.winner.detail', '+2'],
        ['help.battle.score', 'help.battle.score.detail', '+2'],
    ];

    return (
        <Modal
            wide
            title={t('help.title')}
            subtitle={t('help.eyebrow')}
            onClose={onClose}
            footer={
                <button className="btn btn--primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
                    {t('help.close')}
                </button>
            }
        >
            <p style={{ margin: 0 }}>{t('help.intro')}</p>

            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr>
                            <th>{t('help.col.what')}</th>
                            <th>{t('help.col.when')}</th>
                            <th className="num">{t('help.col.points')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([label, detail, points]) => (
                            <tr key={label}>
                                <td>{t(label)}</td>
                                <td className="muted">{t(detail)}</td>
                                <td className="num" style={{ color: 'var(--ok)', fontWeight: 600 }}>{points}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <section className="stack" style={{ gap: '0.4rem' }}>
                <h3>{t('help.matchup.title')}</h3>
                <p className="muted" style={{ margin: 0 }}>{t('help.matchup.body')}</p>
            </section>

            <section className="stack" style={{ gap: '0.4rem' }}>
                <h3>{t('help.gap.title')}</h3>
                <p className="muted" style={{ margin: 0 }}>{t('help.gap.body')}</p>
                <div className="panel panel--flush">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('help.gap.col.gap')}</th>
                                {[0, 1, 2, 3, 4, '5+'].map((g) => (
                                    <th key={g} className="num">{g}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="muted">{t('help.gap.col.points')}</td>
                                {[5, 4, 3, 2, 1, 0].map((p, i) => (
                                    <td key={i} className="num" style={{ color: p ? 'var(--ok)' : 'var(--ink-faint)' }}>
                                        {p}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="stack" style={{ gap: '0.4rem' }}>
                <h3>{t('help.drafts.title')}</h3>
                <p className="muted" style={{ margin: 0 }}>{t('help.drafts.body')}</p>
            </section>
        </Modal>
    );
}