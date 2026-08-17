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

    // La limite compte les groupes possédés ET rejoints : chacun coûte les mêmes
    // classements à recalculer, quel que soit le titre qu'on y porte.
    const atLimit = data ? data.groups.length >= data.limits.groups : false;

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
            <header className="spread">
                <div>
                    <p className="eyebrow">{t('groups.eyebrow')}</p>
                    <h1>{t('groups.title')}</h1>
                </div>
                {data && (
                    <span className="tag">
                        {t('groups.count', { n: data.groups.length, max: data.limits.groups })}
                    </span>
                )}
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
                                // La coquille porte l'accent du groupe : la vignette annonce
                                // déjà la couleur qu'on retrouvera en entrant.
                                <div key={g.slug} className="grp" data-accent={g.accent} style={{ padding: 0 }}>
                                    <Link
                                        to={`/groups/${g.slug}`}
                                        className="mosaic__card"
                                        style={{ height: '100%' }}
                                    >
                                        <span className="mosaic__who" style={{ justifyContent: 'space-between' }}>
                                            <strong style={{ fontSize: '1.05rem' }}>{g.name}</strong>
                                            {g.myRole === 'OWNER' && <span className="ladder__crown">★</span>}
                                        </span>

                                        {g.description && (
                                            <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                                                {g.description}
                                            </p>
                                        )}

                                        <p className="mosaic__line">
                                            {t('groups.members', { n: g.memberCount })}
                                            {' · '}
                                            {g.eventCount > 0
                                                ? t('groups.events', { n: g.eventCount })
                                                : t('groups.events.none')}
                                        </p>
                                        <p className="mosaic__line">{t('group.joined', { date: date(g.joinedAt) })}</p>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}

                    <section className="panel stack" style={{ maxWidth: '34rem' }}>
                        <h2>{t('groups.create')}</h2>

                        {atLimit ? (
                            <p className="faint">{t('groups.full', { max: data.limits.groups })}</p>
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

            {toast && <Toast message={toast.message} ok={toast.ok} onDismiss={() => setToast(null)} />}
        </div>
    );
}