import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';

/**
 * Le barème, en une lecture.
 *
 * La version précédente accumulait un tableau, un second tableau et quatre
 * paragraphes : personne ne lit ça en pleine saisie de pronostic. Ici quatre
 * blocs, chacun avec son gain en gros et une phrase. Deux détails seulement
 * sont développés : une affiche paie où qu'elle se joue, et le podium paie même
 * quand l'arbre s'est effondré — les deux règles qui changent la façon de
 * remplir.
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
                <Card points="+2 → +5" label={t('help.card.four')} hint={t('help.card.four.hint')} accent />
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

            {/* Le podium final. Même bande de chiffres que l'écart de placement :
                c'est la forme qui se lit le plus vite, et les deux barèmes se
                comparent alors d'un coup d'œil. */}
            <section>
                <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{t('help.four.title')}</p>
                <div className="gapscale">
                    {[
                        [t('help.four.first'), 5],
                        [t('help.four.second'), 4],
                        [t('help.four.third'), 3],
                        [t('help.four.fourth'), 2],
                    ].map(([label, points]) => (
                        <span className="gapscale__step" key={label}>
                            <span className="gapscale__points">{points}</span>
                            <span className="gapscale__label">{label}</span>
                        </span>
                    ))}
                </div>
                <p style={{ margin: '0.5rem 0 0' }}>{t('help.four.short')}</p>
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