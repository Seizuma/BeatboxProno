import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import Modal from './Modal.jsx';

const MIN = 20;
const MAX = 1000;

/**
 * La boîte à idées.
 *
 * Deux catégories, un texte, un envoi. Le quota mensuel s'affiche AVANT la
 * saisie : découvrir qu'il ne reste plus rien après avoir écrit dix lignes est
 * la meilleure façon de ne jamais revenir.
 *
 * Le composant n'est monté que pour un compte connecté — la page d'accueil ne
 * propose même pas le bouton autrement.
 */
export default function PostboxDialog({ onClose }) {
    const { t } = useI18n();
    const [kind, setKind] = useState('SUGGESTION');
    const [body, setBody] = useState('');
    const [quota, setQuota] = useState(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        api.get('/postbox/quota').then(setQuota).catch(() => { });
    }, []);

    const length = body.trim().length;
    const exhausted = quota?.remaining === 0;
    const tooShort = length < MIN;

    async function send() {
        setSending(true);
        setError(null);
        try {
            const res = await api.post('/postbox', { kind, body: body.trim() });
            setQuota(res.quota ?? quota);
            setSent(true);
        } catch (e) {
            // Le serveur renvoie le quota à jour même sur un refus : l'afficher
            // évite de laisser croire qu'il reste des messages quand non.
            setError(e.message);
            api.get('/postbox/quota').then(setQuota).catch(() => { });
        } finally {
            setSending(false);
        }
    }

    if (sent) {
        return (
            <Modal
                title={t('postbox.sent.title')}
                onClose={onClose}
                footer={
                    <button className="btn btn--primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
                        {t('postbox.close')}
                    </button>
                }
            >
                <p style={{ margin: 0 }}>{t('postbox.sent.body')}</p>
                {quota && (
                    <p className="faint" style={{ fontSize: '0.85rem', margin: '0.6rem 0 0' }}>
                        {t('postbox.quota', { n: quota.remaining, max: quota.limit })}
                    </p>
                )}
            </Modal>
        );
    }

    return (
        <Modal
            title={t('postbox.title')}
            subtitle={t('postbox.eyebrow')}
            onClose={onClose}
            footer={
                <>
                    <button
                        className="btn btn--primary"
                        onClick={send}
                        disabled={sending || tooShort || exhausted}
                    >
                        {sending ? t('postbox.sending') : t('postbox.send')}
                    </button>
                    <button className="btn" onClick={onClose} disabled={sending}>
                        {t('postbox.cancel')}
                    </button>
                    <span className="faint" style={{ fontSize: '0.82rem', marginLeft: 'auto' }}>
                        {quota
                            ? t('postbox.quota', { n: quota.remaining, max: quota.limit })
                            : t('common.loading')}
                    </span>
                </>
            }
        >
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>{t('postbox.lede')}</p>

            {/* Deux boutons plutôt qu'un menu déroulant : il n'y a que deux
                choix, et l'un des deux doit être visible sans clic. */}
            <fieldset className="postbox__kinds">
                <legend className="eyebrow">{t('postbox.kind')}</legend>
                {[
                    ['SUGGESTION', 'postbox.kind.suggestion', 'postbox.kind.suggestion.hint'],
                    ['BUG', 'postbox.kind.bug', 'postbox.kind.bug.hint'],
                ].map(([value, label, hint]) => (
                    <button
                        key={value}
                        type="button"
                        className={`postbox__kind${kind === value ? ' postbox__kind--on' : ''}`}
                        aria-pressed={kind === value}
                        onClick={() => setKind(value)}
                        disabled={sending}
                    >
                        <span className="postbox__kind-name">{t(label)}</span>
                        <span className="postbox__kind-hint">{t(hint)}</span>
                    </button>
                ))}
            </fieldset>

            <div className="field">
                <label htmlFor="postbox-body">{t('postbox.body')}</label>
                <textarea
                    id="postbox-body"
                    rows={7}
                    maxLength={MAX}
                    value={body}
                    disabled={sending || exhausted}
                    placeholder={t(kind === 'BUG' ? 'postbox.body.ph.bug' : 'postbox.body.ph.suggestion')}
                    onChange={(e) => setBody(e.target.value)}
                />
                <p
                    className="faint data"
                    style={{
                        fontSize: '0.8rem',
                        margin: '0.25rem 0 0',
                        color: length > MAX - 50 ? 'var(--y)' : undefined,
                    }}
                >
                    {length} / {MAX}
                    {tooShort && length > 0 && ` · ${t('postbox.tooshort', { n: MIN })}`}
                </p>
            </div>

            {exhausted && <p className="notice">{t('postbox.exhausted')}</p>}
            {error && <p className="notice">{error}</p>}
        </Modal>
    );
}