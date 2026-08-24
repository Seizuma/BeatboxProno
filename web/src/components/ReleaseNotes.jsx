import Modal from './Modal.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { RELEASES } from '../lib/releases.js';

/**
 * Le journal des nouveautés, en entier.
 *
 * Toutes les notes, pas seulement celles qu'on n'a pas lues : c'est un document
 * permanent, consultable autant de fois qu'on veut. Ce qui change une fois lu,
 * c'est uniquement la pastille de la cloche — le contenu, lui, ne bouge pas.
 *
 * Les notes déjà lues sont grisées plutôt que masquées. Quelqu'un qui revient
 * après un mois doit voir d'un coup d'œil ce qui est neuf pour lui, sans perdre
 * la possibilité de relire le reste.
 */
export default function ReleaseNotes({ lastReadRelease, onClose }) {
    const { t, date } = useI18n();
    const cursor = lastReadRelease ?? '';

    return (
        <Modal
            title={t('news.title')}
            onClose={onClose}
            footer={
                <button className="btn btn--primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
                    {t('news.close')}
                </button>
            }
        >
            <p className="muted" style={{ marginTop: 0 }}>{t('news.lede')}</p>

            <div className="stack" style={{ gap: '1.4rem', marginTop: '1rem' }}>
                {RELEASES.map((release) => {
                    const fresh = release.id > cursor;
                    return (
                        <section key={release.id}>
                            <div className="row" style={{ gap: '0.5rem', alignItems: 'baseline' }}>
                                <h2 style={{ margin: 0, color: fresh ? 'var(--accent)' : 'inherit' }}>
                                    {t(release.titleKey)}
                                </h2>
                                {fresh && <span className="tag tag--now">{t('news.new')}</span>}
                            </div>

                            <p className="faint data" style={{ margin: '0.2rem 0 0.7rem', fontSize: '0.78rem' }}>
                                {date(`${release.id}T12:00:00`)}
                            </p>

                            {/* Un point par changement, sans titre ni sous-titre : la liste se
                  parcourt debout, dans un métro, entre deux battles. */}
                            <ul className="stack" style={{ gap: '0.5rem', margin: 0, paddingLeft: '1.2rem' }}>
                                {release.items.map((key) => (
                                    <li key={key} style={{ color: fresh ? 'var(--ink)' : 'var(--ink-faint)' }}>
                                        {t(key)}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
        </Modal>
    );
}