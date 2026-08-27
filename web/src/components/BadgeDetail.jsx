import Modal from './Modal.jsx';
import { Badge } from './Cosmetics.jsx';

/**
 * La fiche d'un badge.
 *
 * Le mur de badges est joli et muet : sept cubes de couleurs différentes ne
 * disent pas à quoi ils correspondent, et une légende permanente sous chaque
 * profil serait un pavé qu'on ne lit qu'une fois. La fiche répond quand on la
 * demande — au survol pour l'intitulé, au clic pour le reste.
 *
 * `award` est facultatif : depuis la boutique, on consulte le badge en tant que
 * RÈGLE, sans compétition ni date. Depuis un profil, il porte en plus la
 * compète où il est tombé et le jour où il l'a fait.
 */
export default function BadgeDetail({ code, award, t, date, onClose }) {
    if (!code) return null;

    return (
        <Modal
            title={t(`badge.${code}.name`)}
            subtitle={award?.event ? `${award.event.name} ${award.event.year}` : t('badge.rule')}
            onClose={onClose}
            footer={
                <button className="btn" onClick={onClose}>
                    {t('common.close')}
                </button>
            }
        >
            <div className="cos-sheet">
                <span className="cos-sheet__art">
                    {/* Quatre fois la taille du mur : c'est la seule occasion de
                        regarder le dessin plutôt que de le reconnaître. */}
                    <Badge code={code} scale={4} label={t(`badge.${code}.name`)} />
                </span>

                <div className="cos-sheet__body stack" style={{ gap: '0.6rem' }}>
                    <p className="eyebrow" style={{ margin: 0 }}>{t(`badge.${code}`)}</p>
                    <p style={{ margin: 0 }}>{t(`badge.${code}.detail`)}</p>

                    {award?.awardedAt && (
                        <p className="faint data" style={{ margin: 0, fontSize: '0.85rem' }}>
                            {t('badge.awarded', {
                                date: date(award.awardedAt, {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                }),
                            })}
                        </p>
                    )}

                    <p className="faint" style={{ margin: 0, fontSize: '0.85rem' }}>
                        {t('badge.free.note')}
                    </p>
                </div>
            </div>
        </Modal>
    );
}