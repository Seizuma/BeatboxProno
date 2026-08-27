import Modal from './Modal.jsx';
import { Badge } from './Cosmetics.jsx';

/**
 * La fiche d'un badge.
 *
 * Trois lignes au maximum, et c'est volontaire. Un mur de badges se consulte au
 * passage, pas en s'installant : la première version noyait le critère — la
 * seule chose qu'on vient chercher — sous un rappel du règlement que personne
 * ne lit deux fois.
 *
 * `award` est facultatif : depuis la boutique, on consulte le badge en tant que
 * RÈGLE, sans compétition ni date. Depuis un profil, il porte en plus la compète
 * où il est tombé et le jour où il l'a fait.
 */
export default function BadgeDetail({ code, award, t, date, onClose }) {
    if (!code) return null;

    return (
        <Modal
            title={t(`badge.${code}`)}
            subtitle={award?.event ? `${award.event.name} ${award.event.year}` : t(`badge.${code}.name`)}
            onClose={onClose}
            footer={<button className="btn" onClick={onClose}>{t('common.close')}</button>}
        >
            <div className="cos-sheet">
                <span className="cos-sheet__art">
                    {/* Quatre fois la taille du mur : c'est la seule occasion de
                        regarder le dessin plutôt que de le reconnaître. */}
                    <Badge code={code} scale={4} label={t(`badge.${code}`)} />
                </span>

                <div className="cos-sheet__body stack" style={{ gap: '0.5rem' }}>
                    <p style={{ margin: 0 }}>{t(`badge.${code}.detail`)}</p>

                    {award?.awardedAt && (
                        <p className="faint data" style={{ margin: 0, fontSize: '0.85rem' }}>
                            {t('badge.awarded', {
                                date: date(award.awardedAt, { day: 'numeric', month: 'long', year: 'numeric' }),
                            })}
                        </p>
                    )}
                </div>
            </div>
        </Modal>
    );
}