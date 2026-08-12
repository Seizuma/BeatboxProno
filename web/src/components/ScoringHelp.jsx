import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';

/**
 * Le barème, en une lecture.
 *
 * La version précédente accumulait un tableau, un second tableau et quatre
 * paragraphes : personne ne lit ça en pleine saisie de pronostic. Ici trois
 * blocs, chacun avec son gain en gros et une phrase. Le détail qui compte
 * vraiment — une affiche paie où qu'elle se joue — est la seule chose
 * développée.
 */
export default function ScoringHelp({ onClose }) {
    const { t } = useI18n();

    return (
        <Modal
            title={t('help.title')}
            onClose={onClose}
            footer={
                <button className="btn btn--primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
                    {t('help.close')}
                </button>
            }
        >
            <div className="scorecards">
                <Card points="+1 → +5" label={t('help.card.rank')} hint={t('help.card.rank.hint')} />
                <Card points="+1" label={t('help.card.qualify')} hint={t('help.card.qualify.hint')} />
                <Card points="+6" label={t('help.card.battle')} hint={t('help.card.battle.hint')} accent />
            </div>

            {/* L'écart de placement : une bande de chiffres se lit d'un coup d'œil,
          là où un tableau à deux lignes demandait de croiser des cellules. */}
            <section>
                <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{t('help.gap.title')}</p>
                <div className="gapscale">
                    {[
                        [t('help.gap.exact'), 5],
                        ['±1', 4],
                        ['±2', 3],
                        ['±3', 2],
                        ['±4', 1],
                        [t('help.gap.beyond'), 0],
                    ].map(([label, points]) => (
                        <span className="gapscale__step" key={label}>
                            <span className="gapscale__points" data-zero={points === 0 ? '' : undefined}>
                                {points}
                            </span>
                            <span className="gapscale__label">{label}</span>
                        </span>
                    ))}
                </div>
            </section>

            <section>
                <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>{t('help.matchup.title')}</p>
                <p style={{ margin: 0 }}>{t('help.matchup.short')}</p>
            </section>
        </Modal>
    );
}

function Card({ points, label, hint, accent }) {
    return (
        <div className="scorecard">
            <p className="scorecard__points" style={accent ? { color: 'var(--y)' } : undefined}>
                {points}
            </p>
            <p className="scorecard__label">{label}</p>
            <p className="scorecard__hint">{hint}</p>
        </div>
    );
}