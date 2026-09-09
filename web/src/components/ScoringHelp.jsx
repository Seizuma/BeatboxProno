import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';

/**
 * Le barème, en une lecture.
 *
 * ─── Une seule fenêtre, deux barèmes ────────────────────────────────────────
 *
 * Il y en avait deux : celle-ci pour les tableaux, `WildcardHelp` pour les
 * sélections. La séparation partait d'une bonne intention — quelqu'un qui
 * remplit une sélection n'a pas à lire comment se comptent les affiches d'un
 * tableau — mais elle avait deux défauts.
 *
 * Le premier : l'accueil, qui ne connaît aucune catégorie, n'ouvrait que
 * celle-ci. Le barème des sélections n'était donc accessible NULLE PART tant
 * qu'on n'avait pas ouvert une compétition de wildcards en cours.
 *
 * Le second : rien ne disait de quel type d'événement on parlait. Les deux
 * fenêtres s'appelaient « Comment marchent les points », affichaient la même
 * bande de chiffres pour l'écart de placement, et n'annonçaient pas laquelle
 * on lisait. Deux barèmes qui se ressemblent sans se nommer sont pires qu'un
 * seul document.
 *
 * D'où `mode`. Le sous-titre annonce le type d'événement, et le contenu s'y
 * limite. Sur l'accueil, `all` montre les deux, chacun sous son intertitre.
 *
 * ─── La forme ───────────────────────────────────────────────────────────────
 *
 * Quatre blocs par barème, chacun avec son gain en gros et une phrase. Une
 * version antérieure accumulait un tableau, un second tableau et quatre
 * paragraphes : personne ne lit ça en pleine saisie de pronostic.
 */
export default function ScoringHelp({ mode = 'all', places, onClose }) {
    const { t } = useI18n();

    const showWildcard = mode === 'wildcard' || mode === 'all';
    const showBracket = mode === 'bracket' || mode === 'all';
    // Deux barèmes affichés d'affilée : ils ont besoin d'un intertitre pour ne
    // pas se lire comme un seul long document. Seuls, ils s'en passent — le
    // sous-titre de la fenêtre dit déjà de quoi il s'agit.
    const titled = mode === 'all';

    const n = places ?? '—';
    const subtitle =
        mode === 'wildcard'
            ? t('help.mode.wildcard', { n })
            : mode === 'bracket'
                ? t('help.mode.bracket')
                : t('help.mode.all');

    return (
        <Modal
            title={t('help.title')}
            subtitle={subtitle}
            onClose={onClose}
            footer={
                <button className="btn btn--primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
                    {t('help.close')}
                </button>
            }
        >
            {showWildcard && (
                <div className="stack" style={{ gap: '1rem' }}>
                    {titled && (
                        <div>
                            <h3 style={{ margin: 0 }}>{t('help.kind.wildcard')}</h3>
                            <p className="faint" style={{ margin: '0.2rem 0 0', fontSize: '0.88rem' }}>
                                {t('help.kind.wildcard.lede')}
                            </p>
                        </div>
                    )}

                    <p style={{ margin: 0 }}>{t('wc.lede', { n })}</p>

                    <div className="scorecards">
                        <Card points="+3" label={t('wc.card.hit')} hint={t('wc.card.hit.hint', { n })} accent />
                        <Card points="+5" label={t('wc.card.place')} hint={t('wc.card.place.hint')} />
                    </div>

                    <section>
                        <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{t('wc.gap.title')}</p>
                        <GapScale exact={t('wc.gap.exact')} beyond={t('wc.gap.beyond')} />
                        <p style={{ margin: '0.5rem 0 0' }}>{t('wc.gap.short')}</p>
                    </section>

                    <section>
                        <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>{t('wc.hit.title')}</p>
                        <p style={{ margin: 0 }}>{t('wc.hit.short', { n })}</p>
                    </section>

                    <p className="faint" style={{ margin: 0, fontSize: '0.88rem' }}>{t('wc.note')}</p>
                </div>
            )}

            {/* Le filet entre les deux barèmes n'existe qu'en mode « tout » :
                ailleurs il séparerait un barème de rien. */}
            {showWildcard && showBracket && (
                <hr style={{ border: 0, borderTop: 'var(--frame)', margin: '1.4rem 0' }} />
            )}

            {showBracket && (
                <div className="stack" style={{ gap: '1rem' }}>
                    {titled && (
                        <div>
                            <h3 style={{ margin: 0 }}>{t('help.kind.bracket')}</h3>
                            <p className="faint" style={{ margin: '0.2rem 0 0', fontSize: '0.88rem' }}>
                                {t('help.kind.bracket.lede')}
                            </p>
                        </div>
                    )}

                    <div className="scorecards">
                        <Card points="+1 → +5" label={t('help.card.rank')} hint={t('help.card.rank.hint')} />
                        <Card points="+1" label={t('help.card.qualify')} hint={t('help.card.qualify.hint')} />
                        <Card points="+6" label={t('help.card.battle')} hint={t('help.card.battle.hint')} accent />
                        <Card points="+2 → +5" label={t('help.card.four')} hint={t('help.card.four.hint')} accent />
                    </div>

                    {/* L'écart de placement : une bande de chiffres se lit d'un coup
                        d'œil, là où un tableau à deux lignes demandait de croiser des
                        cellules. */}
                    <section>
                        <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{t('help.gap.title')}</p>
                        <GapScale exact={t('help.gap.exact')} beyond={t('help.gap.beyond')} />
                    </section>

                    <section>
                        <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>{t('help.matchup.title')}</p>
                        <p style={{ margin: 0 }}>{t('help.matchup.short')}</p>
                    </section>

                    {/* Le podium final. Même bande de chiffres que l'écart de
                        placement : c'est la forme qui se lit le plus vite, et les deux
                        barèmes se comparent alors d'un coup d'œil. */}
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
                </div>
            )}
        </Modal>
    );
}

/**
 * La bande de l'écart de placement, 5 à 0.
 *
 * Identique aux deux barèmes — c'est la MÊME règle, appliquée à un classement
 * de sélection ou à un classement de qualification. Les deux fenêtres la
 * redessinaient chacune de son côté, avec un `data-zero` d'un côté seulement :
 * le zéro de la sélection ne se grisait pas.
 */
function GapScale({ exact, beyond }) {
    return (
        <div className="gapscale">
            {[
                [exact, 5],
                ['±1', 4],
                ['±2', 3],
                ['±3', 2],
                ['±4', 1],
                [beyond, 0],
            ].map(([label, points]) => (
                <span className="gapscale__step" key={label}>
                    <span className="gapscale__points" data-zero={points === 0 ? '' : undefined}>
                        {points}
                    </span>
                    <span className="gapscale__label">{label}</span>
                </span>
            ))}
        </div>
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