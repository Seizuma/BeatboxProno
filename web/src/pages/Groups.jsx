import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';
import DiscordButton from '../components/DiscordButton.jsx';
import Toast from '../components/Toast.jsx';

/**
 * Mes groupes.
 *
 * La page ne liste que les cercles dont on est membre : rien ici n'explore, il
 * n'y a pas d'annuaire. Un groupe se rejoint par un lien, et se retrouve
 * ensuite ici.
 */
export default function Groups() {
    const { t, date } = useI18n();
    const { user, loading } = useSession();

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!user) return;
        api
            .get('/groups/mine')
            .then(setData)
            .catch((e) => setError(e.message));
    }, [user]);

    if (loading) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    if (!user) {
        return (
            <div className="stack" style={{ paddingTop: '2.5rem' }}>
                <header>
                    <p className="eyebrow">{t('groups.eyebrow')}</p>
                    <h1>{t('groups.title')}</h1>
                </header>
                <p className="muted">{t('groups.lede')}</p>
                <p><DiscordButton next="/groups" /></p>
            </div>
        );
    }

    const owned = data?.groups.filter((g) => g.myRole === 'OWNER').length ?? 0;
    const atLimit = data ? owned >= data.limits.ownedMax : false;

    const create = async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        try {
            const { group } = await api.post('/groups', {
                name: name.trim(),
                description: description.trim() || null,
            });
            setName('');
            setDescription('');
            // On recharge la liste plutôt que d'y insérer la réponse : les deux
            // formes ne portent pas les mêmes champs, et une liste reconstruite à la
            // main finit toujours par diverger de celle du serveur.
            setData(await api.get('/groups/mine'));
            setToast({ ok: true, message: group.name });
        } catch (err) {
            setToast({ ok: false, message: err.message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="stack" style={{ paddingTop: '2.5rem' }}>
            <header>
                <p className="eyebrow">{t('groups.eyebrow')}</p>
                <h1>{t('groups.title')}</h1>
            </header>

            <p className="muted" style={{ maxWidth: '46rem' }}>{t('groups.lede')}</p>

            {error && <p className="notice">{error}</p>}
            {!data && !error && <p className="faint">{t('common.loading')}</p>}

            {data && (
                <>
                    {data.groups.length === 0 ? (
                        <p className="empty">{t('groups.empty')}</p>
                    ) : (
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                            {data.groups.map((g) => (
                                <Link key={g.slug} to={`/groups/${g.slug}`} className="panel" style={{ display: 'block' }}>
                                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <strong style={{ fontSize: '1.1rem' }}>{g.name}</strong>
                                        {g.myRole === 'OWNER' && <span className="tag tag--now">{t('groups.role.OWNER')}</span>}
                                    </div>
                                    {g.description && (
                                        <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
                                            {g.description}
                                        </p>
                                    )}
                                    <p className="faint data" style={{ margin: '0.6rem 0 0', fontSize: '0.8rem' }}>
                                        {t('groups.members', { n: g.memberCount })} · {t('group.joined', { date: date(g.joinedAt) })}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    )}

                    <section className="panel stack" style={{ maxWidth: '34rem' }}>
                        <h2>{t('groups.create')}</h2>

                        {atLimit ? (
                            <p className="faint">{t('groups.full', { max: data.limits.ownedMax })}</p>
                        ) : (
                            <form className="stack" style={{ gap: '0.7rem' }} onSubmit={create}>
                                <div className="field">
                                    <label htmlFor="group-name">{t('groups.create.name')}</label>
                                    <input
                                        id="group-name"
                                        value={name}
                                        maxLength={60}
                                        placeholder={t('groups.create.name.hint')}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div className="field">
                                    <label htmlFor="group-desc">{t('groups.create.description')}</label>
                                    <input
                                        id="group-desc"
                                        value={description}
                                        maxLength={280}
                                        placeholder={t('groups.create.description.hint')}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <button className="btn btn--primary" disabled={!name.trim() || busy}>
                                        {t('groups.create.submit')}
                                    </button>
                                </div>
                            </form>
                        )}
                    </section>
                </>
            )}

            {toast && (
                <Toast message={toast.message} ok={toast.ok} onDismiss={() => setToast(null)} />
            )}
        </div>
    );
}