import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Une confirmation passagère, posée dans un coin de l'écran.
 *
 * L'ancienne version s'insérait dans la barre d'action et y restait : elle
 * doublonnait avec l'étiquette d'état et poussait les boutons. Ici le message
 * flotte, ne déplace rien, et s'efface tout seul.
 *
 * Les erreurs, elles, ne disparaissent pas : on ne rate pas un échec
 * d'enregistrement parce qu'on regardait ailleurs.
 */
export default function Toast({ message, ok = true, onDismiss, duration = 4000 }) {
    const { t } = useI18n();
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        setLeaving(false);
        if (!ok) return undefined; // une erreur attend qu'on la ferme

        const out = setTimeout(() => setLeaving(true), duration);
        const gone = setTimeout(onDismiss, duration + 200);
        return () => {
            clearTimeout(out);
            clearTimeout(gone);
        };
    }, [message, ok, duration, onDismiss]);

    if (!message) return null;

    return (
        <div
            className={`toast${ok ? '' : ' toast--error'}${leaving ? ' toast--leaving' : ''}`}
            role="status"
            aria-live="polite"
        >
            <span aria-hidden="true">{ok ? '✓' : '!'}</span>
            <span>{message}</span>
            <button type="button" className="toast__close" onClick={onDismiss} aria-label={t('common.close')}>
                ✕
            </button>
        </div>
    );
}