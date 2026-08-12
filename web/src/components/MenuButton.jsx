import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Un menu contextuel ouvert par un bouton « ⋮ ».
 *
 * Il se rend en position fixe plutôt que dans le flux : les lignes de tableau
 * ont un `overflow` qui rognerait un menu absolu, et une ligne haute
 * repousserait la mise en page. Le menu se place donc à l'écran, sous le
 * bouton, et se replie vers le haut quand il n'y a plus de place en bas.
 */
export default function MenuButton({ label = 'Actions', items }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const trigger = useRef(null);
    const panel = useRef(null);

    useLayoutEffect(() => {
        if (!open || !trigger.current) return;
        const r = trigger.current.getBoundingClientRect();
        const height = panel.current?.offsetHeight ?? 0;
        const below = window.innerHeight - r.bottom;

        setPos({
            // Aligné à droite du bouton : le menu pousse vers l'intérieur de la page.
            right: Math.max(8, window.innerWidth - r.right),
            top: below < height + 12 ? Math.max(8, r.top - height - 4) : r.bottom + 4,
        });
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;

        const close = (e) => {
            if (panel.current?.contains(e.target) || trigger.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => e.key === 'Escape' && setOpen(false);

        document.addEventListener('mousedown', close);
        window.addEventListener('keydown', onKey);
        // Le menu est en position fixe : il ne suit pas le défilement, donc on le
        // ferme plutôt que de le laisser flotter loin de sa ligne.
        window.addEventListener('scroll', () => setOpen(false), { once: true, capture: true });

        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const visible = items.filter(Boolean);

    return (
        <>
            <button
                ref={trigger}
                type="button"
                className="menubtn"
                aria-label={label}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen((v) => !v)}
            >
                ⋮
            </button>

            {open && (
                <div
                    ref={panel}
                    className="menupanel"
                    role="menu"
                    style={pos ? { top: pos.top, right: pos.right } : { visibility: 'hidden' }}
                >
                    {visible.map((item, i) =>
                        item.separator ? (
                            <hr key={`sep-${i}`} className="menupanel__sep" />
                        ) : (
                            <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                className={`menupanel__item${item.danger ? ' menupanel__item--danger' : ''}`}
                                disabled={item.disabled}
                                onClick={() => {
                                    setOpen(false);
                                    item.onClick();
                                }}
                            >
                                {item.label}
                            </button>
                        )
                    )}
                </div>
            )}
        </>
    );
}