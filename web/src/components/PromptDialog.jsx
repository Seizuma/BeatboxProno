import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

/**
 * Une fenêtre pour saisir un texte court. Sert à nommer un brouillon, mais
 * n'a rien de spécifique : titre, aide et libellés viennent de l'appelant.
 *
 * Entrée valide, Échap annule — le Modal s'occupe déjà d'Échap et du piège à
 * focus, on ne gère ici que la touche Entrée et la validation du champ.
 */
export default function PromptDialog({
    title,
    subtitle,
    label,
    hint,
    initialValue = '',
    maxLength = 60,
    confirmLabel,
    cancelLabel,
    busy = false,
    onConfirm,
    onCancel,
}) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => setValue(initialValue), [initialValue]);

    const trimmed = value.trim();
    const submit = () => trimmed && !busy && onConfirm(trimmed);

    return (
        <Modal
            title={title}
            subtitle={subtitle}
            onClose={onCancel}
            footer={
                <>
                    <button className="btn btn--primary" disabled={!trimmed || busy} onClick={submit}>
                        {confirmLabel}
                    </button>
                    <button className="btn" onClick={onCancel} disabled={busy}>
                        {cancelLabel}
                    </button>
                </>
            }
        >
            <div className="field">
                <label htmlFor="prompt-value">{label}</label>
                <input
                    id="prompt-value"
                    type="text"
                    value={value}
                    maxLength={maxLength}
                    autoFocus
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
            </div>
            {hint && <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>{hint}</p>}
        </Modal>
    );
}