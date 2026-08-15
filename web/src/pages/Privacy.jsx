import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';

/**
 * La politique de confidentialité.
 *
 * Écrite pour être lue, pas pour couvrir : des phrases courtes, la raison de
 * chaque donnée à côté de la donnée, et la marche à suivre pour tout effacer
 * plutôt qu'une adresse à qui écrire.
 *
 * Le texte vit dans i18n.jsx comme le reste du site : une politique qui
 * n'existe que dans une langue ne parle pas à la moitié des joueurs.
 */
export default function Privacy() {
    const { t } = useI18n();
    const { user } = useSession();

    return (
        <div className="stack" style={{ paddingTop: '2.5rem', maxWidth: '46rem' }}>
            <header>
                <p className="eyebrow">{t('privacy.eyebrow')}</p>
                <h1>{t('privacy.title')}</h1>
                <p className="muted">{t('privacy.updated')}</p>
            </header>

            <p>{t('privacy.lede')}</p>

            <Section title={t('privacy.collect.title')}>
                <p>{t('privacy.collect.lede')}</p>
                <dl className="stack" style={{ gap: '0.7rem', margin: 0 }}>
                    <Item term={t('privacy.collect.discord')} def={t('privacy.collect.discord.why')} />
                    <Item term={t('privacy.collect.predictions')} def={t('privacy.collect.predictions.why')} />
                    <Item term={t('privacy.collect.visits')} def={t('privacy.collect.visits.why')} />
                    <Item term={t('privacy.collect.postbox')} def={t('privacy.collect.postbox.why')} />
                </dl>
                <p className="faint">{t('privacy.collect.not')}</p>
            </Section>

            <Section title={t('privacy.public.title')}>
                <p>{t('privacy.public.lede')}</p>
                <p>{t('privacy.public.hidden')}</p>
            </Section>

            <Section title={t('privacy.cookies.title')}>
                <p>{t('privacy.cookies.lede')}</p>
                <p className="faint">{t('privacy.cookies.none')}</p>
            </Section>

            <Section title={t('privacy.third.title')}>
                <p>{t('privacy.third.discord')}</p>
                <p>{t('privacy.third.host')}</p>
                <p className="faint">{t('privacy.third.none')}</p>
            </Section>

            <Section title={t('privacy.keep.title')}>
                <p>{t('privacy.keep.lede')}</p>
            </Section>

            <Section title={t('privacy.rights.title')}>
                <p>{t('privacy.rights.lede')}</p>
                <ul className="stack" style={{ gap: '0.35rem', margin: 0, paddingLeft: '1.1rem' }}>
                    <li>{t('privacy.rights.export')}</li>
                    <li>{t('privacy.rights.delete')}</li>
                    <li>{t('privacy.rights.fix')}</li>
                </ul>
                {/* Un lien vers l'écran qui fait la chose, plutôt qu'une adresse
                    à qui écrire : un droit qui demande une démarche n'est
                    qu'à moitié un droit. */}
                {user ? (
                    <p>
                        <Link className="btn btn--small" to="/me">
                            {t('privacy.rights.cta')}
                        </Link>
                    </p>
                ) : (
                    <p className="faint">{t('privacy.rights.signin')}</p>
                )}
            </Section>

            <Section title={t('privacy.contact.title')}>
                <p>{t('privacy.contact.lede')}</p>
            </Section>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="stack" style={{ gap: '0.6rem' }}>
            <h2>{title}</h2>
            {children}
        </section>
    );
}

function Item({ term, def }) {
    return (
        <div>
            <dt style={{ color: 'var(--y)', fontFamily: 'var(--font-data)' }}>{term}</dt>
            <dd style={{ margin: '0.15rem 0 0' }} className="muted">{def}</dd>
        </div>
    );
}