import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';
import MenuButton from '../components/MenuButton.jsx';
import Modal from '../components/Modal.jsx';
import PromptDialog from '../components/PromptDialog.jsx';
import PredictionView from '../components/PredictionView.jsx';
import Toast from '../components/Toast.jsx';

/**
 * Un groupe.
 *
 * L'organisation ne reprend pas celle du reste du site, et c'est délibéré : un
 * cercle privé qui ressemblerait au classement général ne serait qu'un filtre
 * de plus. Ici le classement n'est pas un tableau posé sous un titre — c'est
 * l'échelle qui tient la colonne de gauche, et elle sert de navigation : on
 * clique un membre, la mosaïque de droite se réduit à ses pronostics.
 *
 * La règle de répartition, tenue partout : la colonne principale ne contient
 * QUE des pronostics. L'invitation, l'administration des membres et le choix
 * des compétitions vivent dans le rail ou derrière une fenêtre — ce sont des
 * réglages qu'on touche trois fois dans la vie d'un groupe.
 *
 * Un groupe dont on n'est pas membre répond 404, comme un groupe qui n'existe
 * pas. On affiche donc la même chose dans les deux cas, sans chercher à
 * distinguer.
 */
export default function GroupPage() {
    const { slug } = useParams();
    const { t, number } = useI18n();
    const { user, loading } = useSession();
    const navigate = useNavigate();

    const [group, setGroup] = useState(null);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    const [board, setBoard] = useState(null);
    const [picks, setPicks] = useState(null);
    const [focus, setFocus] = useState(null); // membre sélectionné dans l'échelle

    const [reading, setReading] = useState(null);
    const [renaming, setRenaming] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [scoping, setScoping] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(
        () => api.get(`/groups/${slug}`).then(({ group }) => setGroup(group)),
        [slug]
    );

    const reloadPicks = useCallback(
        () =>
            api
                .get(`/groups/${slug}/predictions`)
                .then(({ predictions }) => setPicks(predictions))
                .catch(() => { }),
        [slug]
    );

    useEffect(() => {
        if (!user) return;
        setError(null);
        reload().catch((e) => setError(e.message));
    }, [user, reload]);

    useEffect(() => {
        if (!user || !group) return;
        setBoard(null);
        setPicks(null);
        api.get(`/groups/${slug}/scoreboard`).then(setBoard).catch((e) => setError(e.message));
        reloadPicks();
    }, [user, group, slug, reloadPicks]);

    if (loading) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    if (!user) {
        return (
            <div className="empty" style={{ marginTop: '4rem' }}>
                <p>{t('groups.lede')}</p>
            </div>
        );
    }

    if (error && !group) {
        return (
            <div className="stack" style={{ paddingTop: '2.5rem' }}>
                <p className="notice">{error}</p>
            </div>
        );
    }

    if (!group) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    const isOwner = group.myRole === 'OWNER';
    const configured = group.events.length > 0;
    const inviteUrl = `${window.location.origin}/groups/join/${group.inviteCode}`;
    const shown = focus ? (picks ?? []).filter((p) => p.user.id === focus) : picks ?? [];
    const focused = group.members.find((m) => m.id === focus);

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

    return (
        <div className="shell grp" data-accent={group.accent}>
            {/* --- La ligne de service, sur deux étages -------------------------- */}
            <header className="grp__head">
                <div className="grp__bar">
                    <span className="grp__sigil">GRP</span>
                    <h1 className="grp__name">{group.name}</h1>
                    <span className="grp__spacer" />
                    <MenuButton
                        label={t('nav.menu')}
                        items={[
                            isOwner && { label: t('group.scope.edit'), onClick: () => setScoping(true) },
                            isOwner && { label: t('group.rename'), onClick: () => setRenaming(true) },
                            isOwner && group.memberCount > 1 && {
                                label: t('group.transfer'),
                                onClick: () => setTransferring(true),
                            },
                            { separator: true },
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
                </div>

                <div className="grp__strip">
                    <p className="grp__meta">{t('groups.members', { n: group.memberCount })}</p>
                    <p className="grp__meta">
                        {configured
                            ? group.events.map((e) => `${e.name} ${e.year}`).join(' · ')
                            : t('groups.events.none')}
                    </p>
                </div>
            </header>

            {group.description && <p className="grp__note">{group.description}</p>}

            {!configured && (
                <p className="empty" style={{ marginTop: '1rem' }}>
                    {isOwner ? t('group.scope.empty.owner') : t('group.scope.empty')}
                    {isOwner && (
                        <>
                            {' '}
                            <button className="btn btn--small btn--primary" onClick={() => setScoping(true)}>
                                {t('group.scope.edit')}
                            </button>
                        </>
                    )}
                </p>
            )}

            <div className="grp__layout">
                {/* --- L'échelle : classement, navigation et administration -------- */}
                <aside className="grp__rail">
                    <p className="grp__railhead">{t('group.ladder')}</p>

                    {!board ? (
                        <p className="faint" style={{ padding: '0.6rem' }}>{t('common.loading')}</p>
                    ) : board.players.length === 0 ? (
                        <p className="faint" style={{ padding: '0.6rem' }}>{t('group.ladder.empty')}</p>
                    ) : (
                        <ol className="ladder">
                            {board.players.map((p, i) => {
                                const id = p.user?.id;
                                const on = focus === id;
                                const member = group.members.find((m) => m.id === id);
                                return (
                                    <li
                                        key={id ?? i}
                                        className={
                                            'ladder__row' +
                                            (on ? ' ladder__row--on' : '') +
                                            (p.predictions === 0 ? ' ladder__row--idle' : '')
                                        }
                                    >
                                        <button
                                            type="button"
                                            className="ladder__pick"
                                            // Recliquer le même membre lève le filtre : sans ça il
                                            // faudrait chercher un bouton « tout » ailleurs à l'écran.
                                            onClick={() => setFocus(on ? null : id)}
                                            aria-pressed={on}
                                        >
                                            <span className="ladder__rank">{String(i + 1).padStart(2, '0')}</span>

                                            <span className="ladder__who">
                                                {p.user?.avatarUrl && <img className="avatar" src={p.user.avatarUrl} alt="" />}
                                                <span className="ladder__name">
                                                    {p.user?.globalName ?? p.user?.username ?? t('leaderboard.deleted')}
                                                </span>
                                                {member?.role === 'OWNER' && <span className="ladder__crown">★</span>}
                                            </span>

                                            {/* Les chiffres en sous-ligne. Sur la même ligne que le
                          pseudo, ils le tronquaient dès sept caractères. */}
                                            <span className="ladder__sub">
                                                <span className="ladder__pts">{number(p.points)} {t('common.points')}</span>
                                                {' · '}
                                                {p.predictions > 0
                                                    ? t('group.ladder.picks', { n: p.predictions })
                                                    : t('group.ladder.none')}
                                            </span>
                                        </button>

                                        {/* L'administration se fait ici, sur la ligne du membre —
                        une seconde liste plus bas répétait les mêmes gens. */}
                                        {isOwner && id && id !== user.id && (
                                            <span className="ladder__acts">
                                                <MenuButton
                                                    label={t('nav.menu')}
                                                    items={[
                                                        {
                                                            label: t('group.transfer'),
                                                            onClick: () => {
                                                                const name = p.user?.globalName ?? p.user?.username;
                                                                if (!window.confirm(t('group.transfer.confirm', { name }))) return;
                                                                act(async () => {
                                                                    await api.post(`/groups/${slug}/transfer`, { userId: id });
                                                                    await reload();
                                                                });
                                                            },
                                                        },
                                                        {
                                                            label: t('group.kick'),
                                                            danger: true,
                                                            onClick: () => {
                                                                const name = p.user?.globalName ?? p.user?.username;
                                                                if (!window.confirm(t('group.kick.confirm', { name }))) return;
                                                                act(async () => {
                                                                    await api.del(`/groups/${slug}/members/${id}`);
                                                                    await reload();
                                                                });
                                                            },
                                                        },
                                                    ]}
                                                />
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    {/* --- Le pied du rail : l'invitation, réduite à une porte ------- */}
                    <div className="grp__railfoot">
                        <button className="btn btn--small" onClick={() => setInviting(true)}>
                            {t('group.invite.short')}
                        </button>
                        {!group.inviteOpen && <span className="grp__meta">{t('group.invite.closed')}</span>}
                    </div>
                </aside>

                {/* --- La mosaïque des pronostics, et rien d'autre ----------------- */}
                <main className="grp__main stack">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                        <h2 style={{ margin: 0 }}>
                            {focused
                                ? t('group.picks.of', { name: focused.globalName ?? focused.username })
                                : t('group.picks')}
                        </h2>
                        {focus && (
                            <button className="btn btn--small btn--ghost" onClick={() => setFocus(null)}>
                                {t('group.picks.all')}
                            </button>
                        )}
                    </div>

                    {!picks ? (
                        <p className="faint">{t('common.loading')}</p>
                    ) : shown.length === 0 ? (
                        <p className="empty">{t('group.picks.empty')}</p>
                    ) : (
                        <div className="mosaic">
                            {shown.map((p) => (
                                <button key={p.id} type="button" className="mosaic__card" onClick={() => setReading(p.id)}>
                                    <span className="mosaic__who">
                                        {p.user.avatarUrl && <img className="avatar" src={p.user.avatarUrl} alt="" />}
                                        <strong className="mosaic__name">{p.user.globalName ?? p.user.username}</strong>
                                        {p.comments > 0 && (
                                            <span className="mosaic__bubbles">
                                                {t('group.picks.comments', { n: p.comments })}
                                            </span>
                                        )}
                                    </span>

                                    {/* Deux lignes fixes, quelle que soit la situation. Les
                      vignettes non scorées perdaient leur seconde ligne, et la
                      mosaïque paraissait dépareillée. */}
                                    <p className="mosaic__line">{p.event.name} {p.event.year}</p>
                                    <p className="mosaic__line">
                                        {p.category.name}
                                        {' · '}
                                        {p.scoredAt ? (
                                            <span className="mosaic__pts">{number(p.points)} {t('common.points')}</span>
                                        ) : (
                                            t('group.picks.pending')
                                        )}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {reading && (
                <PredictionView
                    predictionId={reading}
                    groupSlug={slug}
                    groupName={group.name}
                    onClose={() => {
                        setReading(null);
                        // Le compteur de bulles des vignettes est daté dès qu'on a écrit
                        // quelque chose dans la fiche : on le rafraîchit à la fermeture.
                        reloadPicks();
                    }}
                />
            )}

            {inviting && (
                <Modal title={t('group.invite')} onClose={() => setInviting(false)}>
                    <p className="muted" style={{ marginTop: 0 }}>
                        {group.inviteOpen ? t('group.invite.lede') : t('group.invite.closed')}
                    </p>

                    <div className="row" style={{ marginTop: '0.8rem' }}>
                        <input
                            readOnly
                            value={inviteUrl}
                            onFocus={(e) => e.target.select()}
                            style={{ flex: '1 1 16rem', minWidth: 0 }}
                            aria-label={t('group.invite')}
                        />
                        <button
                            className="btn btn--small"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(inviteUrl);
                                    setToast({ ok: true, message: t('group.invite.copied') });
                                } catch {
                                    // Presse-papiers refusé : le champ reste sélectionnable, la
                                    // copie manuelle fonctionne toujours.
                                    setToast({ ok: false, message: inviteUrl });
                                }
                            }}
                        >
                            {t('group.invite.copy')}
                        </button>
                    </div>

                    {isOwner && (
                        <div className="row" style={{ marginTop: '0.8rem' }}>
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
                        </div>
                    )}
                </Modal>
            )}

            {scoping && (
                <ScopeDialog
                    group={group}
                    busy={busy}
                    onCancel={() => setScoping(false)}
                    onSave={(slugs) =>
                        act(async () => {
                            const { group } = await api.put(`/groups/${slug}/events`, { slugs });
                            setGroup(group);
                            setScoping(false);
                        }, t('group.scope.saved'))
                    }
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
                                        const name = m.globalName ?? m.username;
                                        if (!window.confirm(t('group.transfer.confirm', { name }))) return;
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

/**
 * Le choix des compétitions suivies.
 *
 * Une liste de pastilles à cocher plutôt qu'une sélection multiple : le nombre
 * d'événements se compte sur les doigts, et une liste déroulante à sélection
 * multiple est un des rares contrôles que personne ne sait manipuler du
 * premier coup.
 */
function ScopeDialog({ group, busy, onCancel, onSave }) {
    const { t } = useI18n();
    const [events, setEvents] = useState([]);
    const [picked, setPicked] = useState(() => group.events.map((e) => e.slug));

    useEffect(() => {
        api.get('/scoreboard/filters').then(({ events }) => setEvents(events)).catch(() => { });
    }, []);

    const toggle = (slug) =>
        setPicked((list) =>
            list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug].slice(0, group.limits.events)
        );

    return (
        <Modal
            title={t('group.scope')}
            onClose={onCancel}
            footer={
                <>
                    <button className="btn btn--primary" disabled={busy} onClick={() => onSave(picked)}>
                        {t('group.scope.save')}
                    </button>
                    <button className="btn btn--ghost" onClick={onCancel}>{t('thread.cancel')}</button>
                </>
            }
        >
            <p className="muted">{t('group.scope.lede')}</p>

            <div className="scope" style={{ margin: '0.9rem 0' }}>
                {events.map((ev) => {
                    const on = picked.includes(ev.slug);
                    return (
                        <button
                            key={ev.slug}
                            type="button"
                            className={`scope__chip${on ? ' scope__chip--on' : ''}`}
                            aria-pressed={on}
                            onClick={() => toggle(ev.slug)}
                        >
                            {ev.name} {ev.year}
                        </button>
                    );
                })}
            </div>

            <p className="faint" style={{ fontSize: '0.85rem' }}>{t('group.scope.keep')}</p>
        </Modal>
    );
}