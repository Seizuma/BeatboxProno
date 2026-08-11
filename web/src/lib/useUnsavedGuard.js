import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Empêche de quitter une page en laissant des modifications derrière soi.
 *
 * Il y a trois façons de partir, et elles ne s'interceptent pas de la même
 * manière :
 *
 * 1. Fermer l'onglet ou recharger — seul `beforeunload` le voit, et le
 *    navigateur impose alors sa propre fenêtre, qu'on ne peut ni habiller ni
 *    enrichir. On s'en contente : c'est le seul recours.
 * 2. Cliquer un lien interne — l'application reste chargée, donc on intercepte
 *    le clic en phase de capture et on montre notre propre fenêtre, celle qui
 *    peut proposer d'enregistrer.
 * 3. Le bouton Précédent — il ne déclenche pas `beforeunload` dans une
 *    application à page unique. On empile une entrée d'historique factice pour
 *    que le retour revienne sur place, et on ouvre la fenêtre.
 *
 * @param {boolean} dirty     y a-t-il quelque chose à perdre ?
 * @returns {{pending, confirm, cancel}} l'intention de sortie en attente
 */
export default function useUnsavedGuard(dirty) {
    // { type: 'link', href } | { type: 'back' } | { type: 'action', run }
    const [pending, setPending] = useState(null);
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;

    // --- 1. Fermeture et rechargement ---------------------------------------
    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = ''; // exigé par les navigateurs pour afficher la fenêtre
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    // --- 2. Liens internes ---------------------------------------------------
    useEffect(() => {
        if (!dirty) return undefined;

        const onClick = (event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const anchor = event.target.closest?.('a[href]');
            if (!anchor) return;
            if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return; // lien externe : on laisse
            if (url.pathname === window.location.pathname) return; // même page

            event.preventDefault();
            event.stopPropagation();
            setPending({ type: 'link', href: url.pathname + url.search });
        };

        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [dirty]);

    // --- 3. Bouton Précédent -------------------------------------------------
    useEffect(() => {
        if (!dirty) return undefined;

        // Une entrée factice : le premier retour revient ici, et non à la page
        // précédente. On la retire dès que la page redevient propre.
        window.history.pushState({ guard: true }, '');

        const onPopState = () => {
            if (!dirtyRef.current) return;
            window.history.pushState({ guard: true }, '');
            setPending({ type: 'back' });
        };

        window.addEventListener('popstate', onPopState);
        return () => {
            window.removeEventListener('popstate', onPopState);
            if (window.history.state?.guard) window.history.back();
        };
    }, [dirty]);

    /** Demande la permission avant une action interne (changer de catégorie…). */
    const guard = useCallback(
        (run) => {
            if (!dirtyRef.current) return run();
            return setPending({ type: 'action', run });
        },
        []
    );

    const cancel = useCallback(() => setPending(null), []);

    return { pending, cancel, guard, setPending };
}