import Modal from './Modal.jsx';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Le barème d'une compétition de wildcards.
 *
 * Une fenêtre à part, et pas une section de plus dans l'aide générale : les
 * deux barèmes ne se ressemblent pas, et surtout on n'est jamais dans les deux
 * à la fois. Quelqu'un qui remplit une sélection n'a aucune raison de lire
 * comment se comptent les affiches d'un tableau — il n'y en a pas.
 */
export default function WildcardHelp({ places, onClose }) {
    const { t } = useI18n();

    return (
        <Modal
            title={t('wc.title')}
            subtitle={t('wc.subtitle', { n: places ?? '—' })}
            onClose={onClose}
            footer={<button className="btn" onClick={onClose}>{t('common.close')}</button>}
        >
            <div className="stack" style={{ gap: '1rem' }}>
                <p style={{ margin: 0 }}>{t('wc.lede', { n: places ?? '—' })}</p>

                <div className="scorecards">
                    <Card points="+3" label={t('wc.card.hit')} hint={t('wc.card.hit.hint')} accent />
                    <Card points="+5" label={t('wc.card.place')} hint={t('wc.card.place.hint')} />
                </div>

                {/* Le barème de placement, dans la même bande de chiffres que
                    l'aide générale : les deux se comparent alors d'un coup. */}
                <section>
                    <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{t('wc.gap.title')}</p>
                    <div className="gapscale">
                        {[
                            [t('wc.gap.exact'), 5],
                            ['±1', 4],
                            ['±2', 3],
                            ['±3', 2],
                            ['±4', 1],
                            [t('wc.gap.beyond'), 0],
                        ].map(([label, points]) => (
                            <span className="gapscale__step" key={label}>
                                <span className="gapscale__points">{points}</span>
                                <span className="gapscale__label">{label}</span>
                            </span>
                        ))}
                    </div>
                    <p style={{ margin: '0.5rem 0 0' }}>{t('wc.gap.short')}</p>
                </section>

                <section>
                    <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>{t('wc.hit.title')}</p>
                    <p style={{ margin: 0 }}>{t('wc.hit.short', { n: places ?? '—' })}</p>
                </section>

                <p className="faint" style={{ margin: 0, fontSize: '0.88rem' }}>
                    {t('wc.note')}
                </p>
            </div>
        </Modal>
    );
}

function Card({ points, label, hint, accent }) {
    return (
        <div className="scorecard">
            <p
                className="display"
                style={{
                    margin: 0,
                    fontSize: 'calc(2.2rem * var(--display-scale))',
                    color: accent ? 'var(--accent)' : 'var(--ok)',
                }}
            >
                {points}
            </p>
            <p style={{ margin: '0.2rem 0 0' }}>{label}</p>
            <p className="faint" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>{hint}</p>
        </div>
    );
}