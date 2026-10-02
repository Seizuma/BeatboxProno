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
 *
 * ─── Accroché à un élément, pas à la fiche ──────────────────────────────────
 *
 * Un tampon visait la fiche entière, en fractions de sa boîte. Mais la fiche
 * se réorganise avec la largeur de l'écran — le tableau passe d'une colonne à
 * cinq — et un tampon posé sur une demi-finale depuis un ordinateur tombait au
 * milieu d'un classement sur téléphone. Il s'accroche désormais à l'élément
 * visé, avec les clés `data-anchor` des commentaires. Les fractions de la
 * fiche restent la position de repli, et celle des tampons d'avant.
 *
 * ─── La punaise ─────────────────────────────────────────────────────────────
 *
 * Chaque tampon est épinglé par l'avatar de son auteur. Le survol ne
 * fonctionne pas sur téléphone et le tampon n'intercepte aucun clic : sans la
 * punaise, rien ne disait qui avait tamponné.
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
        setSpots(stamps.map((s) => {
            const el = s.anchorKey && canvas.querySelector(`[data-anchor="${CSS.escape(s.anchorKey)}"]`);
            if (!el) return { ...s, left: s.x * box.width, top: s.y * box.height };
            const er = el.getBoundingClientRect();
            return {
                ...s,
                left: er.left - box.left + (s.anchorX ?? 0.5) * er.width,
                top: er.top - box.top + (s.anchorY ?? 0.5) * er.height,
            };
        }));
    }, [canvasRef, stamps]);

    useEffect(() => {
        measure();
        // La fiche change de hauteur sans que la fenêtre bouge : photos qui
        // arrivent, fil de commentaires qui s'allonge. Les éléments visés se
        // déplacent avec, d'où l'observateur.
        const ro = new ResizeObserver(measure);
        if (canvasRef?.current) ro.observe(canvasRef.current);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [measure, canvasRef]);

    async function place(event) {
        if (!placing || !worn) return;
        const canvas = canvasRef?.current;
        if (!canvas) return;

        const box = canvas.getBoundingClientRect();
        const x = Math.min(0.95, Math.max(0.05, (event.clientX - box.left) / box.width));
        const y = Math.min(0.95, Math.max(0.05, (event.clientY - box.top) / box.height));

        // La couche de pose recouvre la fiche : c'est elle que le clic touche.
        // On regarde donc ce qu'il y a DESSOUS, au même point.
        const target = document
            .elementsFromPoint(event.clientX, event.clientY)
            .map((el) => el.closest('[data-anchor]'))
            .find((el) => el && canvas.contains(el));
        const unit = (v) => Math.min(1, Math.max(0, v));
        let anchor = {};
        if (target) {
            const er = target.getBoundingClientRect();
            anchor = {
                anchorKey: target.dataset.anchor,
                anchorX: unit((event.clientX - er.left) / er.width),
                anchorY: unit((event.clientY - er.top) / er.height),
            };
        }

        try {
            await api.put(base, { itemId: worn, x, y, ...anchor });
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
                        // La couleur est portée par l'enveloppe : le cadre du
                        // tampon ET le cerclage de la punaise la reprennent.
                        className={`gs-mark cos-stamp--${item.color}` + (neuf ? ' gs-mark--slam' : '')}
                        style={{ left: s.left, top: s.top }}
                        aria-label={t('group.stamp.by', { name: nom })}
                    >
                        <span className="cos-stamp gs-mark__stamp">{item.text[lang] ?? item.text.en}</span>
                        <StampPin person={s.author} />
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

/**
 * La punaise : l'avatar de la personne qui a tamponné.
 *
 * Sans avatar, ou s'il ne charge pas, l'initiale prend la place — une punaise
 * vide dirait « quelqu'un », l'initiale dit déjà « qui ».
 */
function StampPin({ person }) {
    const [broken, setBroken] = useState(false);
    const name = person?.globalName ?? person?.username ?? '';
    const url = person?.avatarUrl;
    return (
        <span className="stamp-pin" aria-hidden="true">
            {url && !broken ? (
                <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
            ) : (
                <span className="stamp-pin__initial">{name.trim().charAt(0).toUpperCase() || '?'}</span>
            )}
        </span>
    );
}
