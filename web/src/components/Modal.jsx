import { useEffect, useRef } from 'react';

/**
 * Une fenêtre de paramétrage. Rien de plus qu'il n'en faut : un fond qui
 * assombrit, Échap pour fermer, le focus posé dans la fenêtre à l'ouverture et
 * rendu à son point de départ à la fermeture, et le défilement de la page
 * bloqué pendant ce temps — sinon on scrolle l'arrière-plan en croyant
 * scroller la fenêtre.
 */
export default function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
    const panel = useRef(null);
    const returnTo = useRef(null);

    useEffect(() => {
        returnTo.current = document.activeElement;
        panel.current?.focus();

        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key !== 'Tab') return;

            // Piège à focus : la tabulation tourne en boucle dans la fenêtre.
            const focusable = panel.current?.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);

        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
            returnTo.current?.focus?.();
        };
    }, [onClose]);

    return (
        <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div
                className={`modal__panel${wide ? ' modal__panel--wide' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                ref={panel}
            >
                <header className="modal__head">
                    <div>
                        {subtitle && <p className="eyebrow" style={{ margin: 0 }}>{subtitle}</p>}
                        <h2 style={{ margin: 0 }}>{title}</h2>
                    </div>
                    <button className="btn btn--small btn--ghost" onClick={onClose} aria-label="Fermer">
                        ✕
                    </button>
                </header>

                <div className="modal__body">{children}</div>

                {footer && <footer className="modal__foot">{footer}</footer>}
            </div>
        </div>
    );
}