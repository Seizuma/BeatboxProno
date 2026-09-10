import { useState } from 'react';

/**
 * Une explication à la demande.
 *
 * ─── Pourquoi replier plutôt qu'effacer ─────────────────────────────────────
 *
 * Les panneaux d'administration portent des phrases qu'on ne devine pas :
 * qu'enregistrer un classement ne le publie pas, qu'un tirage refait perd les
 * vainqueurs déjà désignés, que changer un réglage de palmarès ne reprend rien
 * de ce qui a été distribué. Ce sont ces phrases-là qui évitent les incidents.
 *
 * Mais elles sont utiles une fois et deviennent du décor les cinquante
 * suivantes, où elles occupent l'écran et repoussent vers le bas ce qu'on est
 * venu faire. Les supprimer coûterait un incident ; les laisser coûte de la
 * fatigue à chaque visite.
 *
 * D'où le pli. Le savoir reste, à un clic.
 *
 * ─── Un bouton et non un <details> ──────────────────────────────────────────
 *
 * `<details>` ferait le même travail sans JavaScript, mais apporte son triangle
 * et son style natifs, qu'il faudrait ensuite désapprendre pour retrouver
 * l'écran télétexte — le même écueil que les bibliothèques de graphiques.
 *
 * ─── L'état vit ici ─────────────────────────────────────────────────────────
 *
 * Chaque explication ouvre et ferme la sienne. Un état partagé plus haut
 * n'apporterait rien : personne n'ouvre deux aides en même temps, et remonter
 * l'état obligerait chaque panneau à en tenir la liste.
 */
export default function Hint({ children, label = 'Explication' }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className={`btn btn--small${open ? ' btn--primary' : ' btn--ghost'}`}
                aria-expanded={open}
                aria-label={label}
                title={label}
                onClick={() => setOpen(!open)}
            >
                ?
            </button>

            {open && (
                <div className="stack" style={{ gap: '0.4rem', flexBasis: '100%', marginTop: '0.4rem' }}>
                    {children}
                </div>
            )}
        </>
    );
}