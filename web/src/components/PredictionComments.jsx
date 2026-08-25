import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Flair, FramedAvatar } from './Cosmetics.jsx';

/** Le serveur tranche ; ce chiffre ne sert qu'à arrêter la frappe au bon endroit. */
const MAX = 2000;

/**
 * Les commentaires d'un pronostic, à l'intérieur d'un groupe.
 *
 * Deux formes pour une même conversation. Les commentaires ANCRÉS s'affichent
 * en pastilles posées sur l'élément qu'ils visent — un rang, une affiche, une
 * phase — et s'ouvrent en bulle au clic. Les commentaires GÉNÉRAUX, sans ancre,
 * tombent dans un fil sous la fiche.
 *
 * La position d'une pastille n'est jamais mémorisée en pixels. Le serveur ne
 * garde qu'une clé d'élément et un décalage en fractions de sa boîte ; la
 * position d'écran est recalculée ici, à chaque rendu et à chaque
 * redimensionnement. C'est ce qui fait qu'une bulle posée sur un grand écran se
 * retrouve au bon endroit sur un téléphone, où les colonnes se replient.
 *
 * Le composant se rend À L'INTÉRIEUR de la boîte qu'il annote (`canvasRef`) :
 * c'est elle qui porte `position: relative`, donc l'origine des coordonnées.
 */
export default function PredictionComments({
    groupSlug,
    groupName,
    predictionId,
    canvasRef,
    placing,
    onPlacingEnd,
}) {
    const { t, date, lang } = useI18n();

    const [comments, setComments] = useState(null);
    const [error, setError] = useState(null);
    const [spots, setSpots] = useState([]); // pastilles positionnées
    const [orphans, setOrphans] = useState([]); // ancres devenues introuvables
    const [open, setOpen] = useState(null); // clé d'ancre ouverte
    const [pending, setPending] = useState(null); // bulle en cours de pose
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(null);

    const base = `/groups/${groupSlug}/predictions/${predictionId}/comments`;

    useEffect(() => {
        setComments(null);
        setError(null);
        setOpen(null);
        setPending(null);
        api
            .get(base)
            .then(({ comments }) => setComments(comments))
            .catch((e) => setError(e.message));
    }, [base]);

    // --- Placement des pastilles ---------------------------------------------
    //
    // Recalculé plutôt que mémorisé : les deux rectangles sont pris dans le
    // repère de la fenêtre, donc le défilement s'annule dans la soustraction et
    // le résultat reste juste quelle que soit la position de la fiche.
    const measure = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !comments) return;

        const buckets = new Map();
        const lost = [];
        for (const c of comments) {
            if (!c.anchorKey) continue;
            if (!buckets.has(c.anchorKey)) buckets.set(c.anchorKey, []);
            buckets.get(c.anchorKey).push(c);
        }

        const cr = canvas.getBoundingClientRect();
        const placed = [];

        for (const [key, list] of buckets) {
            // `CSS.escape` : une clé contient des « : », qui sont des combinateurs en
            // syntaxe de sélecteur. Sans échappement, la requête est invalide et
            // toutes les pastilles disparaissent d'un coup.
            const el = canvas.querySelector(`[data-anchor="${CSS.escape(key)}"]`);
            if (!el) {
                // L'élément visé n'est plus affiché — phase retirée, format changé.
                // Le commentaire n'est pas perdu : il rejoint le fil du bas.
                lost.push(...list);
                continue;
            }
            const er = el.getBoundingClientRect();
            placed.push({
                key,
                comments: list,
                x: er.left - cr.left + (list[0].anchorX ?? 0.5) * er.width,
                y: er.top - cr.top + (list[0].anchorY ?? 0.5) * er.height,
            });
        }

        setSpots(placed);
        setOrphans(lost);
    }, [comments, canvasRef]);

    useLayoutEffect(() => {
        measure();
    }, [measure]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        // Les images d'artistes arrivent après le premier rendu et poussent les
        // lignes : sans observateur, les pastilles resteraient là où le contenu
        // était avant leur chargement.
        const ro = new ResizeObserver(measure);
        ro.observe(canvas);
        window.addEventListener('resize', measure);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [measure, canvasRef]);

    // --- Mode pose -------------------------------------------------------------
    //
    // L'écoute est posée en phase de capture : les éléments du pronostic n'ont
    // pas de gestionnaire propre, mais la capture garantit qu'aucun futur
    // gestionnaire ne viendra manger le clic avant nous.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !placing) return undefined;

        const onClick = (e) => {
            const el = e.target.closest('[data-anchor]');
            if (!el || !canvas.contains(el)) return;

            e.preventDefault();
            e.stopPropagation();

            const cr = canvas.getBoundingClientRect();
            const er = el.getBoundingClientRect();
            const clamp = (v) => Math.min(1, Math.max(0, v));

            setOpen(null);
            setDraft('');
            setPending({
                anchorKey: el.dataset.anchor,
                anchorX: clamp((e.clientX - er.left) / er.width),
                anchorY: clamp((e.clientY - er.top) / er.height),
                x: e.clientX - cr.left,
                y: e.clientY - cr.top,
            });
            onPlacingEnd?.();
        };

        canvas.addEventListener('click', onClick, true);
        return () => canvas.removeEventListener('click', onClick, true);
    }, [placing, canvasRef, onPlacingEnd]);

    // --- Écritures --------------------------------------------------------------

    const post = async (anchor) => {
        const body = draft.trim();
        if (!body || busy) return;
        setBusy(true);
        setError(null);
        try {
            const { comment } = await api.post(base, { body, ...anchor });
            setComments((list) => [...(list ?? []), comment]);
            setDraft('');
            if (anchor?.anchorKey) {
                setPending(null);
                setOpen(anchor.anchorKey);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        const body = editing.body.trim();
        if (!body || busy) return;
        setBusy(true);
        try {
            const { comment } = await api.patch(`/groups/${groupSlug}/comments/${editing.id}`, { body });
            setComments((list) =>
                list.map((c) => (c.id === comment.id ? { ...c, body: comment.body, editedAt: comment.editedAt } : c))
            );
            setEditing(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id) => {
        if (!window.confirm(t('thread.delete.confirm')) || busy) return;
        setBusy(true);
        try {
            await api.del(`/groups/${groupSlug}/comments/${id}`);
            setComments((list) => list.filter((c) => c.id !== id));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    // --- Rendu --------------------------------------------------------------------

    /**
     * Un commentaire.
     *
     * Une fonction appelée, pas un composant monté : déclaré comme composant à
     * l'intérieur du rendu, il serait recréé à chaque frappe, la zone de saisie
     * serait démontée puis remontée, et le curseur sauterait hors du champ dès
     * la première lettre d'une modification.
     */
    const note = (c) => (
        <div className="note" key={c.id}>
            <div className="note__head">
                {/* Le cadre acheté vaut aussi dans une conversation de groupe :
                    c'est là que les membres se lisent le plus souvent. */}
                {c.author.avatarUrl && (
                    <FramedAvatar
                        url={c.author.avatarUrl}
                        frameId={c.author.equippedFrame}
                        size="xs"
                    />
                )}
                <strong>{c.author.globalName ?? c.author.username}</strong>
                <Flair itemId={c.author.equippedFlair} size={14} lang={lang} />
                <span className="note__when">
                    {date(c.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {c.editedAt && ` · ${t('thread.edited')}`}
                </span>
            </div>

            {editing?.id === c.id ? (
                <div className="stack" style={{ gap: '0.3rem', marginTop: '0.3rem' }}>
                    <textarea
                        rows={3}
                        maxLength={MAX}
                        value={editing.body}
                        onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                    />
                    <div className="row">
                        <button className="btn btn--small btn--primary" disabled={busy} onClick={save}>
                            {t('thread.save')}
                        </button>
                        <button className="btn btn--small btn--ghost" onClick={() => setEditing(null)}>
                            {t('thread.cancel')}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="note__body">{c.body}</p>
                    {(c.mine || c.canDelete) && (
                        <div className="note__acts">
                            {c.mine && (
                                <button
                                    className="btn btn--small btn--ghost"
                                    onClick={() => setEditing({ id: c.id, body: c.body })}
                                >
                                    {t('thread.edit')}
                                </button>
                            )}
                            {c.canDelete && (
                                <button className="btn btn--small btn--ghost" onClick={() => remove(c.id)}>
                                    {t('thread.delete')}
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );

    const composer = (anchor) => (
        <form
            className="stack"
            style={{ gap: '0.3rem', marginTop: '0.6rem' }}
            onSubmit={(e) => {
                e.preventDefault();
                post(anchor);
            }}
        >
            <textarea
                rows={3}
                maxLength={MAX}
                value={draft}
                autoFocus={Boolean(anchor?.anchorKey)}
                placeholder={t('thread.placeholder')}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={t('thread.title')}
            />
            <div className="row" style={{ justifyContent: 'space-between' }}>
                <button className="btn btn--small btn--primary" disabled={!draft.trim() || busy}>
                    {t('thread.send')}
                </button>
                {draft.length > MAX - 200 && (
                    <span className="note__when">{draft.length} / {MAX}</span>
                )}
            </div>
        </form>
    );

    if (error && !comments) return <p className="notice">{error}</p>;
    if (!comments) return null;

    const general = comments.filter((c) => !c.anchorKey);
    const openSpot = spots.find((s) => s.key === open);

    return (
        <>
            {/* Les pastilles. Une par point d'ancrage, avec le nombre de remarques
          qui s'y trouvent — deux personnes qui commentent la même affiche
          partagent la même bulle plutôt que d'en empiler deux. */}
            {spots.map((s) => (
                <button
                    key={s.key}
                    type="button"
                    className="pin"
                    style={{ left: s.x, top: s.y }}
                    onClick={() => {
                        setPending(null);
                        setDraft('');
                        setOpen(open === s.key ? null : s.key);
                    }}
                    title={t('thread.title')}
                >
                    {s.comments.length}
                </button>
            ))}

            {openSpot && (
                <div className="bubble" style={{ left: openSpot.x, top: openSpot.y }}>
                    <div className="bubble__head">
                        <span className="bubble__title">{t('thread.title')}</span>
                        <button className="btn btn--small btn--ghost" onClick={() => setOpen(null)}>
                            {t('thread.close')}
                        </button>
                    </div>
                    {openSpot.comments.map(note)}
                    {error && <p className="notice" style={{ marginTop: '0.5rem' }}>{error}</p>}
                    {composer({ anchorKey: openSpot.key, anchorX: openSpot.comments[0].anchorX, anchorY: openSpot.comments[0].anchorY })}
                </div>
            )}

            {/* La bulle en cours de pose : la pastille est déjà là, en creux, pour
          qu'on voie où le commentaire va se fixer avant de l'écrire. */}
            {pending && (
                <>
                    <span className="pin pin--draft" style={{ left: pending.x, top: pending.y }} aria-hidden="true">
                        +
                    </span>
                    <div className="bubble" style={{ left: pending.x, top: pending.y }}>
                        <div className="bubble__head">
                            <span className="bubble__title">{t('pin.mode')}</span>
                            <button className="btn btn--small btn--ghost" onClick={() => setPending(null)}>
                                {t('pin.cancel')}
                            </button>
                        </div>
                        {error && <p className="notice">{error}</p>}
                        {composer({
                            anchorKey: pending.anchorKey,
                            anchorX: pending.anchorX,
                            anchorY: pending.anchorY,
                        })}
                    </div>
                </>
            )}

            {/* Le fil général, sous la fiche : les remarques qui ne visent pas un
          point précis, plus celles dont l'ancre a disparu. */}
            <section className="stack" style={{ gap: '0.6rem', marginTop: '1.6rem' }}>
                <div>
                    <h2>{t('thread.title')}</h2>
                    <p className="note__when" style={{ margin: '0.3rem 0 0' }}>
                        {t('thread.lede', { group: groupName ?? groupSlug })}
                    </p>
                </div>

                {general.length === 0 && orphans.length === 0 && (
                    <p className="empty">{t('thread.empty')}</p>
                )}

                {general.map(note)}

                {orphans.length > 0 && (
                    <>
                        <p className="note__when">{t('pin.orphan')}</p>
                        {orphans.map(note)}
                    </>
                )}

                {error && <p className="notice">{error}</p>}
                {!open && !pending && composer(null)}
            </section>
        </>
    );
}