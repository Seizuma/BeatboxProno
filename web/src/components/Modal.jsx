import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Une fenêtre de paramétrage. Rien de plus qu'il n'en faut : un fond qui
 * assombrit, Échap pour fermer, le focus posé dans la fenêtre à l'ouverture et
 * rendu à son point de départ à la fermeture, et le défilement de la page
 * bloqué pendant ce temps — sinon on scrolle l'arrière-plan en croyant
 * scroller la fenêtre.
 *
 * ─── Pourquoi un portail ────────────────────────────────────────────────────
 *
 * Le contenu est projeté sur `document.body`, jamais rendu à sa place dans
 * l'arbre. Ce n'est pas de la coquetterie : `position: fixed` ne se cale sur la
 * fenêtre du navigateur QUE si aucun ancêtre ne porte de `transform`, de
 * `filter` ou de `perspective`. Sinon il se cale sur cet ancêtre-là.
 *
 * Or nos propres fenêtres en portent un. `cos-unfold` s'achève sur
 * `transform: scale(1)` et le retient — l'animation est en `both`. Une fenêtre
 * ouverte depuis une autre — l'export d'un pronostic, ouvert depuis sa fiche —
 * se retrouvait donc bornée par le panneau parent au lieu de l'écran. Sur une
 * fiche courte, un brouillon à deux noms, ce panneau fait deux cents pixels de
 * haut : la fenêtre d'export héritait de ces deux cents pixels comme surface
 * disponible, tandis que son propre `max-height: 85vh` continuait, lui, de
 * compter en hauteur d'écran. Elle débordait de six cents pixels, sans rien
 * pour la rattraper puisque le voile n'a pas de découpe.
 *
 * Le symptôme désignait le mauvais coupable : il n'apparaissait que sur les
 * brouillons, ce qui laissait croire à un défaut de l'export. Il ne dépendait
 * que de la hauteur de la fiche derrière.
 *
 * Le portail règle la classe entière du problème plutôt que ce cas : plus aucun
 * ancêtre ne peut piéger une fenêtre, quel que soit l'endroit d'où on l'ouvre
 * et quelle que soit la transformation qu'on ajoutera un jour au-dessus.
 *
 * ─── L'ouverture et la fermeture ────────────────────────────────────────────
 *
 * La fenêtre se déplie depuis son centre et s'y replie. La courbe part vite et
 * freine à l'arrivée, ce qui suffit à donner l'impression que la fenêtre se
 * pose.
 *
 * La fermeture est le point délicat. Démonter le composant tout de suite ne
 * laisse rien à animer ; on marque donc la fenêtre comme sortante, on laisse
 * l'animation se jouer, et on prévient l'appelant à la fin. `onClose` n'est
 * appelé qu'une fois, même si l'on clique trois fois sur la croix.
 */
const EXIT_MS = 180;

/**
 * La pile des fenêtres ouvertes, de la plus ancienne à la plus récente.
 *
 * Chaque fenêtre écoute Échap sur `window`, donc toutes l'entendent. Sans cette
 * pile, fermer l'export fermait du même coup la fiche qui l'avait ouvert : deux
 * niveaux d'un coup pour une seule touche, alors qu'on voulait revenir à la
 * fiche. Seule la dernière ouverte répond.
 *
 * Hors de tout état React, et c'est voulu : cette pile n'appartient à aucune
 * fenêtre en particulier, et la faire remonter dans un contexte obligerait
 * chaque appelant à fournir un fournisseur pour une mécanique qui ne le
 * regarde pas.
 */
const stack = [];

export default function Modal({ title, subtitle, onClose, children, footer, wide = false, narrow = false }) {
    const { t } = useI18n();
    const panel = useRef(null);
    const returnTo = useRef(null);
    const [closing, setClosing] = useState(false);
    const done = useRef(false);

    const close = useCallback(() => {
        if (done.current) return;
        done.current = true;
        setClosing(true);
        setTimeout(onClose, EXIT_MS);
    }, [onClose]);

    useEffect(() => {
        // Un jeton d'identité propre à cette fenêtre : deux fenêtres du même
        // composant sont indiscernables autrement.
        const token = {};
        stack.push(token);

        returnTo.current = document.activeElement;
        panel.current?.focus();

        const onKey = (e) => {
            // Seule la fenêtre du dessus répond au clavier. Les autres sont
            // derrière un voile : elles ne sont pas censées être là.
            if (stack[stack.length - 1] !== token) return;

            if (e.key === 'Escape') close();
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

        // Empilées, chaque fenêtre restaure ce qu'elle a trouvé : l'intérieure
        // remet `hidden`, posé par l'extérieure, qui rendra la valeur d'origine
        // en se fermant. La page ne se remet à défiler qu'à la dernière.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);

        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
            const i = stack.indexOf(token);
            if (i >= 0) stack.splice(i, 1);
            returnTo.current?.focus?.();
        };
    }, [close]);

    return createPortal(
        <div
            className={`modal cos-pop${closing ? ' cos-pop--out' : ''}`}
            onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
            <div
                className={`modal__panel${wide ? ' modal__panel--wide' : ''}${narrow ? ' modal__panel--narrow' : ''}`}
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
                    <button className="btn btn--small btn--ghost" onClick={close} aria-label={t('common.close')}>
                        ✕
                    </button>
                </header>

                <div className="modal__body">{children}</div>

                {footer && <footer className="modal__foot">{footer}</footer>}
            </div>
        </div>,
        document.body
    );
}