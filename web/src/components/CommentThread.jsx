import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

/** Le serveur tranche ; ce chiffre ne sert qu'à arrêter la frappe au bon endroit. */
const MAX = 2000;

/**
 * Le fil de commentaires d'un pronostic, à l'intérieur d'un groupe.
 *
 * Plat, sans réponses imbriquées ni mentions : la demande était de pouvoir
 * réagir aux pronostics des autres, pas d'ouvrir une messagerie. Un fil plat se
 * lit d'un coup d'œil et ne réclame ni notifications ni modération.
 *
 * Le même pronostic ouvert depuis deux groupes montre deux fils distincts —
 * c'est le couple (groupe, pronostic) qui porte la conversation.
 */
export default function CommentThread({ groupSlug, groupName, predictionId }) {
    const { t, date } = useI18n();

    const [comments, setComments] = useState(null);
    const [error, setError] = useState(null);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(null); // { id, body }

    const base = `/groups/${groupSlug}/predictions/${predictionId}/comments`;

    useEffect(() => {
        setComments(null);
        setError(null);
        api
            .get(base)
            .then(({ comments }) => setComments(comments))
            .catch((e) => setError(e.message));
    }, [base]);

    const post = async (e) => {
        e.preventDefault();
        const body = draft.trim();
        if (!body || busy) return;
        setBusy(true);
        setError(null);
        try {
            const { comment } = await api.post(base, { body });
            setComments((list) => [...(list ?? []), comment]);
            setDraft('');
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

    return (
        <section className="stack" style={{ gap: '0.7rem', marginTop: '1.6rem' }}>
            <div>
                <h2>{t('thread.title')}</h2>
                <p className="faint" style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>
                    {t('thread.lede', { group: groupName ?? groupSlug })}
                </p>
            </div>

            {error && <p className="notice">{error}</p>}
            {!comments && !error && <p className="faint">{t('common.loading')}</p>}

            {comments && comments.length === 0 && <p className="empty">{t('thread.empty')}</p>}

            {comments && comments.length > 0 && (
                <ul className="stack" style={{ gap: '0.8rem', listStyle: 'none', margin: 0, padding: 0 }}>
                    {comments.map((c) => (
                        <li key={c.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: '0.8rem' }}>
                            <div className="row" style={{ gap: '0.5rem' }}>
                                {c.author.avatarUrl && <img className="avatar" src={c.author.avatarUrl} alt="" />}
                                <strong>{c.author.globalName ?? c.author.username}</strong>
                                <span className="faint data" style={{ fontSize: '0.78rem' }}>
                                    {date(c.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    {c.editedAt && ` · ${t('thread.edited')}`}
                                </span>
                            </div>

                            {editing?.id === c.id ? (
                                <div className="stack" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
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
                                    {/* `pre-wrap` : les retours à la ligne saisis sont conservés,
                      sans qu'aucun balisage ne soit interprété. */}
                                    <p style={{ margin: '0.3rem 0 0', whiteSpace: 'pre-wrap' }}>{c.body}</p>
                                    {(c.mine || c.canDelete) && (
                                        <div className="row" style={{ gap: '0.4rem', marginTop: '0.3rem' }}>
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
                        </li>
                    ))}
                </ul>
            )}

            <form className="stack" style={{ gap: '0.4rem' }} onSubmit={post}>
                <textarea
                    rows={3}
                    maxLength={MAX}
                    value={draft}
                    placeholder={t('thread.placeholder')}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={t('thread.title')}
                />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                    <button className="btn btn--small btn--primary" disabled={!draft.trim() || busy}>
                        {t('thread.send')}
                    </button>
                    {draft.length > MAX - 200 && (
                        <span className="faint data" style={{ fontSize: '0.78rem' }}>
                            {draft.length} / {MAX}
                        </span>
                    )}
                </div>
            </form>
        </section>
    );
}