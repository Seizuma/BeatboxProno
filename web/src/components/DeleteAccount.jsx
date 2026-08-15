import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';

/**
 * La suppression de compte.
 *
 * Trois principes, dans cet ordre : dire ce qui va disparaître, proposer de
 * l'emporter avant, puis exécuter sans demander de justification. La saisie du
 * pseudo est la seule friction — elle arrête le clic accidentel, pas la
 * décision.
 *
 * Le bilan vient du serveur plutôt que d'être recomposé ici : deux formulations
 * finiraient par diverger, et c'est celle de l'écran qu'on croirait.
 */
export default function DeleteAccount({ onClose, onDeleted }) {
    const { t, date } = useI18n();
    const [impact, setImpact] = useState(null);
    const [typed, setTyped] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.get('/account/impact').then(({ impact }) => setImpact(impact)).catch((e) => setError(e.message));
    }, []);

    const matches = impact && typed.trim() === impact.username;

    async function remove() {
        setBusy(true);
        setError(null);
        try {
            await api.del('/account', { username: typed.trim() });
            onDeleted();
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    }

    // L'export passe par une navigation directe : la réponse est un fichier à
    // télécharger, pas du JSON à afficher.
    const exportUrl = `${import.meta.env.VITE_API_URL ?? '/api'}/account/export`;

    return (
        <Modal
            title={t('account.delete.title')}
            subtitle={impact?.username}
            onClose={onClose}
            footer={
                <>
                    <button
                        className="btn btn--danger"
                        disabled={busy || !matches || Boolean(impact?.blocked)}
                        onClick={remove}
                    >
                        {busy ? t('account.delete.working') : t('account.delete.confirm')}
                    </button>
                    <button className="btn" onClick={onClose} disabled={busy}>
                        {t('postbox.cancel')}
                    </button>
                </>
            }
        >
            {error && <p className="notice">{error}</p>}
            {!impact && !error && <p className="faint">{t('common.loading')}</p>}

            {impact && (
                <>
                    <p className="notice">{t('account.delete.warning')}</p>

                    {impact.blocked === 'OWNER' && <p className="notice">{t('account.delete.owner')}</p>}

                    <div className="row" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>
                        <Line value={impact.predictions} label={t('account.line.predictions')} warn />
                        <Line value={impact.points} label={t('account.line.points')} warn />
                        <Line value={impact.postbox} label={t('account.line.postbox')} />
                        <Line value={impact.visits} label={t('account.line.visits')} />
                    </div>

                    <ul className="stack" style={{ gap: '0.35rem', margin: 0, paddingLeft: '1.1rem' }}>
                        <li>{t('account.delete.what.predictions')}</li>
                        <li>{t('account.delete.what.leaderboard')}</li>
                        <li>{t('account.delete.what.postbox')}</li>
                        <li>{t('account.delete.what.discord')}</li>
                        <li>{t('account.delete.what.again')}</li>
                    </ul>

                    {/* Proposé AVANT le champ de confirmation : après, il serait
                        trop tard, et c'est précisément le moment où l'on tient à
                        garder une trace de ses pronostics. */}
                    <p style={{ margin: 0 }}>
                        <a className="btn btn--small" href={exportUrl} download>
                            {t('account.export')}
                        </a>{' '}
                        <span className="faint" style={{ fontSize: '0.85rem' }}>
                            {t('account.export.hint')}
                        </span>
                    </p>

                    {impact.memberSince && (
                        <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                            {t('account.member', {
                                date: date(impact.memberSince, { month: 'long', year: 'numeric' }),
                            })}
                        </p>
                    )}

                    <div className="field">
                        <label htmlFor="account-confirm">
                            {t('account.delete.type', { name: impact.username })}
                        </label>
                        <input
                            id="account-confirm"
                            value={typed}
                            autoComplete="off"
                            disabled={busy || Boolean(impact.blocked)}
                            onChange={(e) => setTyped(e.target.value)}
                        />
                    </div>
                </>
            )}
        </Modal>
    );
}

function Line({ value, label, warn }) {
    return (
        <span className="readout">
            <span className="readout__value" style={warn && value > 0 ? { color: 'var(--r)' } : undefined}>
                {value}
            </span>
            <span className="readout__unit">{label}</span>
        </span>
    );
}