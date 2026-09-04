import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';
import { itemById } from '../lib/cosmetics.js';

/**
 * Les tampons posés par les membres d'un groupe sur un pronostic.
 *
 * ─── Ce que ça remplace, et ce que ça ne remplace pas ───────────────────────
 *
 * Un commentaire demande une phrase, donc une opinion formulée, donc du temps.
 * Beaucoup de gens n'en laisseront jamais. Un tampon ne demande rien : on le
 * pose, il dit « je suis passé et j'en pense quelque chose », et c'est déjà
 * plus que le silence.
 *
 * Il ne remplace pas les commentaires — les deux cohabitent sur la même fiche,
 * et c'est voulu : l'un est une conversation, l'autre une réaction.
 *
 * ─── Un par personne ────────────────────────────────────────────────────────
 *
 * C'est la règle qui rend le mur lisible. Reposer le sien le DÉPLACE au lieu
 * d'en ajouter un, et c'est aussi ce qu'on attend en cliquant ailleurs. Chacun
 * retire le sien, personne ne retire celui d'un autre : un tampon ne porte pas
 * de texte, il n'y a rien à modérer.
 *
 * ─── La barre de commandes est en tête ──────────────────────────────────────
 *
 * Ce composant se rend AVANT la fiche, et ce n'est pas un détail de mise en
 * page. Sa barre — la seule porte de sortie pour retirer son tampon — était
 * rendue en fin de canvas, sous un tableau qui fait deux écrans de haut :
 * personne ne descendait jusque-là, et le retrait passait pour absent. Les
 * marques et la couche de pose sont en position absolue, l'ordre du document
 * ne les concerne pas.
 */
export default function GroupStamps({ groupSlug, predictionId, canvasRef, placing, onPlacingEnd }) {
    const { t, lang } = useI18n();
    const { user } = useSession();

    const [stamps, setStamps] = useState([]);
    const [spots, setSpots] = useState([]);
    const [error, setError] = useState(null);

    /**
     * Le tampon qui vient d'être posé, et le nombre de poses.
     *
     * Le compteur sert de clé de rendu : sans lui, retamponner au même endroit
     * ne remonterait pas l'élément, React se contenterait de déplacer sa
     * position, et l'animation — qui ne se joue qu'à l'apparition — ne
     * repartirait jamais. C'est exactement le mécanisme de l'aperçu de
     * boutique, et c'est pour ça qu'elle marchait là-bas et pas ici.
     */
    const [fresh, setFresh] = useState(null); // { id, hits }

    const base = `/groups/${groupSlug}/predictions/${predictionId}/stamp`;
    const worn = user?.equippedStamp ?? null;

    useEffect(() => {
        setError(null);
        setFresh(null);
        api.get(`${base}s`).then(({ stamps }) => setStamps(stamps)).catch((e) => setError(e.message));
    }, [base]);

    /**
     * Les positions à l'écran.
     *
     * Mesurées à chaque fois plutôt que mémorisées : les deux rectangles sont
     * pris dans le repère de la fenêtre, donc le défilement s'annule dans la
     * soustraction et le résultat reste juste où que soit la fiche. C'est la
     * même mécanique que les pastilles de commentaire, pour la même raison.
     */
    const measure = useCallback(() => {
        const canvas = canvasRef?.current;
        if (!canvas) return;
        const box = canvas.getBoundingClientRect();
        setSpots(stamps.map((s) => ({ ...s, left: s.x * box.width, top: s.y * box.height })));
    }, [canvasRef, stamps]);

    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [measure]);

    async function place(event) {
        if (!placing || !worn) return;
        const canvas = canvasRef?.current;
        if (!canvas) return;

        const box = canvas.getBoundingClientRect();
        const x = Math.min(0.95, Math.max(0.05, (event.clientX - box.left) / box.width));
        const y = Math.min(0.95, Math.max(0.05, (event.clientY - box.top) / box.height));

        try {
            await api.put(base, { itemId: worn, x, y });
            const { stamps: frais } = await api.get(`${base}s`);
            setStamps(frais);
            // Le sien est repéré dans la liste FRAÎCHE et non dans l'ancienne :
            // une première pose n'existe pas encore dans l'état local.
            const neuf = frais.find((s) => s.mine);
            setFresh((f) => ({ id: neuf?.id ?? null, hits: (f?.hits ?? 0) + 1 }));
            onPlacingEnd?.();
        } catch (e) {
            setError(e.message);
        }
    }

    async function remove() {
        setError(null);
        try {
            await api.del(base);
            setStamps((list) => list.filter((s) => !s.mine));
            setFresh(null);
        } catch (e) {
            setError(e.message);
        }
    }

    const mien = stamps.find((s) => s.mine);

    return (
        <>
            {/* La couche de pose. Elle ne couvre la fiche que pendant la pose :
                en permanence, elle intercepterait les clics destinés aux
                commentaires. */}
            {placing && worn && (
                <div className="gs-layer" onClick={place} role="presentation" />
            )}

            {spots.map((s) => {
                const item = itemById(s.itemId);
                if (!item) return null;
                const nom = s.author.globalName ?? s.author.username;
                const neuf = fresh?.id === s.id;
                return (
                    <span
                        // La clé change à chaque pose : React remonte l'élément
                        // et l'animation repart de zéro, même quand on tamponne
                        // deux fois au même endroit.
                        key={neuf ? `${s.id}:${fresh.hits}` : s.id}
                        className={
                            `cos-stamp cos-stamp--posed cos-stamp--${item.color} gs-mark` +
                            (neuf ? ' cos-stamp--slam' : '')
                        }
                        style={{ left: s.left, top: s.top }}
                        title={t('group.stamp.by', { name: nom })}
                    >
                        {item.text[lang] ?? item.text.en}
                    </span>
                );
            })}

            {/* La barre. En tête de fiche, pas en pied : c'est elle qui porte
                le retrait, et un retrait qu'on ne trouve pas n'existe pas. */}
            <div className="gs-bar">
                {!worn && <span className="faint" style={{ fontSize: '0.85rem' }}>{t('group.stamp.none')}</span>}

                {worn && !mien && !placing && (
                    <span className="faint" style={{ fontSize: '0.85rem' }}>{t('group.stamp.invite')}</span>
                )}

                {placing && worn && (
                    <span className="notice notice--ok" style={{ margin: 0 }}>{t('group.stamp.hint')}</span>
                )}

                {mien && (
                    <button className="btn btn--small" onClick={remove}>
                        {t('group.stamp.remove')}
                    </button>
                )}

                {stamps.length > 0 && (
                    <span className="faint data" style={{ fontSize: '0.82rem', marginLeft: 'auto' }}>
                        {t('group.stamp.count', { n: stamps.length })}
                    </span>
                )}
            </div>

            {error && <p className="notice" style={{ margin: '0.4rem 0 0' }}>{error}</p>}
        </>
    );
}