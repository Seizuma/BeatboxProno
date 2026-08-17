import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';
import MenuButton from '../components/MenuButton.jsx';
import Modal from '../components/Modal.jsx';
import PromptDialog from '../components/PromptDialog.jsx';
import PredictionView from '../components/PredictionView.jsx';
import Toast from '../components/Toast.jsx';

/**
 * Un groupe : son classement interne, les pronostics déposés par ses membres,
 * et la porte d'entrée qu'est le lien d'invitation.
 *
 * Un groupe dont on n'est pas membre répond 404, comme un groupe qui n'existe
 * pas — on affiche donc la même chose dans les deux cas, sans chercher à
 * distinguer.
 */
export default function GroupPage() {
    const { slug } = useParams();
    const { t, date, number } = useI18n();
    const { user, loading } = useSession();
    const navigate = useNavigate();

    const [group, setGroup] = useState(null);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    const [filters, setFilters] = useState({ events: [], kinds: [] });
    const [scope, setScope] = useState('');
    const [kind, setKind] = useState('');
    const [board, setBoard] = useState(null);
    const [picks, setPicks] = useState(null);

    const [reading, setReading] = useState(null);
    const [renaming, setRenaming] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(
        () => api.get(`/groups/${slug}`).then(({ group }) => setGroup(group)),
        [slug]
    );

    useEffect(() => {
        if (!user) return;
        setError(null);
        reload().catch((e) => setError(e.message));
        api.get('/scoreboard/filters').then(setFilters).catch(() => { });
    }, [user, reload]);

    useEffect(() => {
        if (!user || !group) return;
        const params = new URLSearchParams();
        if (scope) params.set('event', scope);
        if (kind) params.set('kind', kind);
        const qs = params.toString() ? `?${params}` : '';

        setBoard(null);
        setPicks(null);
        api.get(`/groups/${slug}/scoreboard${qs}`).then(setBoard).catch((e) => setError(e.message));
        api.get(`/groups/${slug}/predictions${qs}`).then(({ predictions }) => setPicks(predictions)).catch(() => { });
    }, [user, group, slug, scope, kind]);

    if (loading) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    if (!user) {
        return (
            <div className="empty" style={{ marginTop: '4rem' }}>
                <p>{t('groups.lede')}</p>
                <Link className="btn" to="/groups">{t('groups.title')}</Link>
            </div>
        );
    }

    if (error) {
        return (
            <div className="stack" style={{ paddingTop: '2.5rem' }}>
                <p className="notice">{error}</p>
                <p><Link className="btn btn--ghost" to="/groups">{t('groups.title')}</Link></p>
            </div>
        );
    }

    if (!group) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    const isOwner = group.myRole === 'OWNER';
    const inviteUrl = `${window.location.origin}/groups/join/${group.inviteCode}`;

    const act = async (fn, done) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            if (done) setToast({ ok: true, message: done });
        } catch (err) {
            setToast({ ok: false, message: err.message });
        } finally {
            setBusy(false);
        }
    };

    const copyInvite = async () => {
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setToast({ ok: true, message: t('group.invite.copied') });
        } catch {
            // Presse-papiers refusé (permission, navigateur ancien) : le champ est
            // en lecture seule et sélectionnable, la copie manuelle reste possible.
            setToast({ ok: false, message: inviteUrl });
        }
    };

    return (
        <div className="stack" style={{ paddingTop: '2.5rem' }}>
            <header className="spread">
                <div>
                    <p className="eyebrow">
                        <Link to="/groups">{t('groups.title')}</Link> · {t('groups.members', { n: group.memberCount })}
                    </p>
                    <h1 style={{ marginBottom: 0 }}>{group.name}</h1>
                    {group.description && <p className="muted" style={{ margin: '0.3rem 0 0' }}>{group.description}</p>}
                </div>

                <MenuButton
                    label={t('nav.menu')}
                    items={[
                        isOwner && { label: t('group.rename'), onClick: () => setRenaming(true) },
                        isOwner && group.memberCount > 1 && {
                            label: t('group.transfer'),
                            onClick: () => setTransferring(true),
                        },
                        !isOwner && {
                            label: t('group.leave'),
                            danger: true,
                            onClick: () => {
                                if (!window.confirm(t('group.leave.confirm'))) return;
                                act(async () => {
                                    await api.post(`/groups/${slug}/leave`);
                                    navigate('/groups');
                                }, t('group.left'));
                            },
                        },
                        isOwner && {
                            label: t('group.dissolve'),
                            danger: true,
                            onClick: () => {
                                if (!window.confirm(t('group.dissolve.confirm'))) return;
                                act(async () => {
                                    await api.del(`/groups/${slug}`);
                                    navigate('/groups');
                                }, t('group.gone'));
                            },
                        },
                    ]}
                />
            </header>

            {/* --- Invitation ---------------------------------------------------- */}
            <section className="panel stack" style={{ gap: '0.6rem' }}>
                <h2>{t('group.invite')}</h2>
                <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                    {group.inviteOpen ? t('group.invite.lede') : t('group.invite.closed')}
                </p>
                <div className="row">
                    <input
                        readOnly
                        value={inviteUrl}
                        onFocus={(e) => e.target.select()}
                        style={{ flex: '1 1 20rem', minWidth: 0 }}
                        aria-label={t('group.invite')}
                    />
                    <button className="btn btn--small" onClick={copyInvite}>{t('group.invite.copy')}</button>
                    {isOwner && (
                        <>
                            <button
                                className="btn btn--small btn--ghost"
                                disabled={busy}
                                onClick={() => {
                                    if (!window.confirm(t('group.invite.rotate.confirm'))) return;
                                    act(async () => {
                                        await api.post(`/groups/${slug}/invite`);
                                        await reload();
                                    });
                                }}
                            >
                                {t('group.invite.rotate')}
                            </button>
                            <button
                                className="btn btn--small btn--ghost"
                                disabled={busy}
                                onClick={() =>
                                    act(async () => {
                                        await api.patch(`/groups/${slug}/invite`, { open: !group.inviteOpen });
                                        await reload();
                                    })
                                }
                            >
                                {group.inviteOpen ? t('group.invite.close') : t('group.invite.reopen')}
                            </button>
                        </>
                    )}
                </div>
            </section>

            {/* --- Périmètre ----------------------------------------------------- */}
            <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-end' }}>
                <div className="field">
                    <label htmlFor="g-scope">{t('leaderboard.scope')}</label>
                    <select id="g-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                        <option value="">{t('leaderboard.scope.all')}</option>
                        {filters.events.map((ev) => (
                            <option key={ev.slug} value={ev.slug}>{ev.name} {ev.year}</option>
                        ))}
                    </select>
                </div>
                <div className="field">
                    <label htmlFor="g-kind">{t('leaderboard.kind')}</label>
                    <select id="g-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                        <option value="">{t('leaderboard.kind.all')}</option>
                        {filters.kinds.map((k) => (
                            <option key={k.kind} value={k.kind}>{t(`kind.${k.kind}`)}</option>
                        ))}
                    </select>
                </div>
                {(scope || kind) && (
                    <button className="btn btn--small btn--ghost" onClick={() => { setScope(''); setKind(''); }}>
                        {t('common.clear')}
                    </button>
                )}
            </div>

            {/* --- Classement ---------------------------------------------------- */}
            <section className="stack">
                <h2>{t('group.standings')}</h2>
                {!board ? (
                    <p className="faint">{t('common.loading')}</p>
                ) : board.players.length === 0 ? (
                    <p className="empty">{t('group.standings.empty')}</p>
                ) : (
                    <div className="panel panel--flush">
                        <table>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>{t('leaderboard.col.player')}</th>
                                    <th className="num">{t('stats.col.predictions')}</th>
                                    <th className="num">{t('leaderboard.col.points')}</th>
                                    <th className="num">{t('stats.col.average')}</th>
                                    <th>{t('stats.col.accuracy')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {board.players.map((p, i) => (
                                    <tr key={p.user?.id ?? i}>
                                        <td className="rank-cell">{i + 1}</td>
                                        <td>
                                            <span className="stat-row">
                                                {p.user?.avatarUrl && <img className="avatar" src={p.user.avatarUrl} alt="" />}
                                                <Link to={`/players/${p.user?.id}`}>
                                                    {p.user?.globalName ?? p.user?.username ?? t('leaderboard.deleted')}
                                                </Link>
                                            </span>
                                        </td>
                                        <td className="num muted">{p.predictions}</td>
                                        <td className="num" style={{ fontWeight: 600 }}>{number(p.points)}</td>
                                        <td className="num muted">{p.average ?? '—'}</td>
                                        <td style={{ minWidth: '9rem' }}>
                                            {p.accuracy == null ? (
                                                <span className="faint">—</span>
                                            ) : (
                                                <>
                                                    <span className="data" style={{ fontSize: '0.78rem' }}>
                                                        {p.accuracy} % · {p.battleHits}/{p.battlePicks}
                                                    </span>
                                                    <span className="meter"><span style={{ width: `${p.accuracy}%` }} /></span>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* --- Pronostics déposés -------------------------------------------- */}
            <section className="stack">
                <h2>{t('group.picks')}</h2>
                {!picks ? (
                    <p className="faint">{t('common.loading')}</p>
                ) : picks.length === 0 ? (
                    <p className="empty">{t('group.picks.empty')}</p>
                ) : (
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {picks.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                className="panel"
                                style={{ textAlign: 'left', cursor: 'pointer' }}
                                onClick={() => setReading(p.id)}
                            >
                                <span className="stat-row">
                                    {p.user.avatarUrl && <img className="avatar" src={p.user.avatarUrl} alt="" />}
                                    <strong>{p.user.globalName ?? p.user.username}</strong>
                                </span>
                                <p className="data" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                                    {p.event.name} {p.event.year} · {p.category.name}
                                </p>
                                <p className="faint data" style={{ margin: '0.3rem 0 0', fontSize: '0.78rem' }}>
                                    {p.scoredAt ? `${number(p.points)} ${t('common.points')} · ` : ''}
                                    {t('group.picks.comments', { n: p.comments })}
                                </p>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* --- Membres -------------------------------------------------------- */}
            <section className="stack">
                <h2>{t('group.members.title')}</h2>
                <div className="panel panel--flush">
                    <table>
                        <tbody>
                            {group.members.map((m) => (
                                <tr key={m.id}>
                                    <td>
                                        <span className="stat-row">
                                            {m.avatarUrl && <img className="avatar" src={m.avatarUrl} alt="" />}
                                            <Link to={`/players/${m.id}`}>{m.globalName ?? m.username}</Link>
                                        </span>
                                    </td>
                                    <td>
                                        {m.role === 'OWNER' && <span className="tag tag--now">{t('groups.role.OWNER')}</span>}
                                    </td>
                                    <td className="muted data" style={{ fontSize: '0.8rem' }}>
                                        {t('group.joined', { date: date(m.joinedAt) })}
                                    </td>
                                    <td style={{ width: '2.5rem' }}>
                                        {isOwner && m.id !== user.id && (
                                            <MenuButton
                                                label={t('nav.menu')}
                                                items={[
                                                    {
                                                        label: t('group.transfer'),
                                                        onClick: () => {
                                                            if (!window.confirm(t('group.transfer.confirm', { name: m.globalName ?? m.username }))) return;
                                                            act(async () => {
                                                                await api.post(`/groups/${slug}/transfer`, { userId: m.id });
                                                                await reload();
                                                            });
                                                        },
                                                    },
                                                    {
                                                        label: t('group.kick'),
                                                        danger: true,
                                                        onClick: () => {
                                                            if (!window.confirm(t('group.kick.confirm', { name: m.globalName ?? m.username }))) return;
                                                            act(async () => {
                                                                await api.del(`/groups/${slug}/members/${m.id}`);
                                                                await reload();
                                                            });
                                                        },
                                                    },
                                                ]}
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {reading && (
                <PredictionView
                    predictionId={reading}
                    groupSlug={slug}
                    groupName={group.name}
                    onClose={() => {
                        setReading(null);
                        // Le compteur de commentaires de la vignette est daté dès qu'on a
                        // écrit quelque chose dans la fiche : on le rafraîchit à la
                        // fermeture plutôt que de le remonter depuis le fil.
                        const params = new URLSearchParams();
                        if (scope) params.set('event', scope);
                        if (kind) params.set('kind', kind);
                        const qs = params.toString() ? `?${params}` : '';
                        api.get(`/groups/${slug}/predictions${qs}`)
                            .then(({ predictions }) => setPicks(predictions))
                            .catch(() => { });
                    }}
                />
            )}

            {renaming && (
                <PromptDialog
                    title={t('group.rename')}
                    label={t('group.rename.label')}
                    initialValue={group.name}
                    maxLength={60}
                    confirmLabel={t('thread.save')}
                    cancelLabel={t('thread.cancel')}
                    busy={busy}
                    onCancel={() => setRenaming(false)}
                    onConfirm={(name) =>
                        act(async () => {
                            await api.patch(`/groups/${slug}`, { name });
                            await reload();
                            setRenaming(false);
                        })
                    }
                />
            )}

            {transferring && (
                <Modal title={t('group.transfer')} onClose={() => setTransferring(false)}>
                    <p className="muted">{t('group.transfer.lede')}</p>
                    <div className="stack" style={{ gap: '0.4rem', marginTop: '0.8rem' }}>
                        {group.members
                            .filter((m) => m.id !== user.id)
                            .map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    className="btn btn--ghost"
                                    disabled={busy}
                                    onClick={() => {
                                        if (!window.confirm(t('group.transfer.confirm', { name: m.globalName ?? m.username }))) return;
                                        act(async () => {
                                            await api.post(`/groups/${slug}/transfer`, { userId: m.id });
                                            await reload();
                                            setTransferring(false);
                                        });
                                    }}
                                >
                                    {m.globalName ?? m.username}
                                </button>
                            ))}
                    </div>
                </Modal>
            )}

            {toast && <Toast message={toast.message} ok={toast.ok} onDismiss={() => setToast(null)} />}
        </div>
    );
}