import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';
import DiscordButton from '../components/DiscordButton.jsx';
import Toast from '../components/Toast.jsx';

/**
 * Extrait le code d'invitation de ce qu'on a collé.
 *
 * Les gens collent ce qu'ils ont reçu : parfois le lien complet, parfois le
 * code seul, parfois le lien avec un espace au bout. Exiger l'un des trois
 * revient à renvoyer une erreur à quelqu'un qui a fait exactement ce qu'on lui
 * demandait — le plus sûr moyen de le perdre.
 *
 * L'analyse est locale : le serveur reste seul juge de la validité du code,
 * mais il n'a pas à recevoir des URL entières pour ça.
 */
function extractCode(input) {
    const value = String(input).trim();
    const fromUrl = value.match(/\/groups\/join\/([a-z0-9]+)/i);
    if (fromUrl) return fromUrl[1];
    // Un code seul : l'alphabet du serveur, sans i, l, 1, o ni 0.
    if (/^[a-hj-km-np-z2-9]{8,24}$/i.test(value)) return value;
    return null;
}

/**
 * Mes groupes.
 *
 * La page ne liste que les cercles dont on est membre : rien ici n'explore, il
 * n'y a pas d'annuaire. Un groupe se rejoint par un lien, et se retrouve
 * ensuite ici — d'où le champ « rejoindre », qui était jusqu'ici la porte
 * manquante : sans lien cliquable sous la main, l'application ne proposait
 * aucun moyen d'entrer quelque part.
 */
export default function Groups() {
    const { t, date } = useI18n();
    const { user, loading } = useSession();
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [invite, setInvite] = useState('');
    const [inviteError, setInviteError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!user) return;
        api.get('/groups/mine').then(setData).catch((e) => setError(e.message));
    }, [user]);

    if (loading) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    if (!user) {
        return (
            <div className="stack" style={{ paddingTop: '2.5rem' }}>
                <header>
                    <p className="eyebrow">{t('groups.eyebrow')}</p>
                    <h1>{t('groups.title')}</h1>
                </header>
                <p className="muted" style={{ maxWidth: '44rem' }}>{t('groups.lede')}</p>
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
            setData(await api.get('/groups/mine'));
            setToast({ ok: true, message: group.name });
        } catch (err) {
            setToast({ ok: false, message: err.message });
        } finally {
            setBusy(false);
        }
    };

    const goToInvite = (e) => {
        e.preventDefault();
        const code = extractCode(invite);
        if (!code) {
            setInviteError(t('groups.join.invalid'));
            return;
        }
        // On mène à la page d'invitation plutôt que d'adhérer directement : elle
        // montre le nom du groupe, son effectif et ce que rejoindre implique. On
        // n'entre pas quelque part sans savoir où.
        navigate(`/groups/join/${code}`);
    };

    return (
        <div className="grp">
            {/* La ligne de service, comme sur la fiche d'un groupe : le compteur y
          trouve sa place au lieu de flotter seul à droite du titre. */}
            <header className="grp__head">
                <div className="grp__bar">
                    <h1 className="grp__name" style={{ fontSize: '2.4rem' }}>{t('groups.title')}</h1>
                    <span className="grp__spacer" />
                    {data && (
                        <span className="grp__meta">
                            {t('groups.count', { n: data.groups.length, max: data.limits.groups })}
                        </span>
                    )}
                </div>
                <div className="grp__strip">
                    <p className="grp__meta">{t('groups.eyebrow')}</p>
                </div>
            </header>

            <p className="grp__note" style={{ maxWidth: '44rem' }}>{t('groups.lede')}</p>

            {error && <p className="notice" style={{ marginTop: '1rem' }}>{error}</p>}
            {!data && !error && <p className="faint" style={{ marginTop: '1rem' }}>{t('common.loading')}</p>}

            {data && (
                <div className="stack" style={{ marginTop: '1.4rem' }}>
                    {data.groups.length === 0 ? (
                        <p className="empty">{t('groups.empty')}</p>
                    ) : (
                        <div className="grouplist">
                            {data.groups.map((g) => (
                                <Link
                                    key={g.slug}
                                    to={`/groups/${g.slug}`}
                                    className="grp groupcard"
                                    data-accent={g.accent}
                                    style={{ padding: '0.8rem 0.9rem' }}
                                >
                                    <span className="groupcard__top">
                                        <span className="groupcard__name">{g.name}</span>
                                        <span className="grp__spacer" />
                                        {g.myRole === 'OWNER' && <span className="ladder__crown">★</span>}
                                    </span>

                                    {g.description && <p className="groupcard__note">{g.description}</p>}

                                    <p className="groupcard__meta">
                                        {t('groups.members', { n: g.memberCount })}
                                        {' · '}
                                        {g.eventCount > 0
                                            ? t('groups.events', { n: g.eventCount })
                                            : t('groups.events.none')}
                                    </p>
                                    <p className="groupcard__meta">{t('group.joined', { date: date(g.joinedAt) })}</p>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Les deux portes, côte à côte : en ouvrir une, ou entrer dans celle
              de quelqu'un d'autre. Elles avaient la même importance depuis le
              début, mais une seule était visible. */}
                    <div className="doors">
                        <section className="panel stack" style={{ gap: '0.7rem' }}>
                            <h2>{t('groups.create')}</h2>

                            {atLimit ? (
                                <p className="faint" style={{ margin: 0 }}>
                                    {t('groups.full', { max: data.limits.groups })}
                                </p>
                            ) : (
                                <form className="stack" style={{ gap: '0.6rem' }} onSubmit={create}>
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

                        <section className="panel stack" style={{ gap: '0.7rem' }}>
                            <h2>{t('groups.join.title')}</h2>
                            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                                {t('groups.join.lede')}
                            </p>

                            <form className="stack" style={{ gap: '0.6rem' }} onSubmit={goToInvite}>
                                <div className="field">
                                    <label htmlFor="join-code">{t('groups.join.field')}</label>
                                    <input
                                        id="join-code"
                                        value={invite}
                                        onChange={(e) => {
                                            setInvite(e.target.value);
                                            setInviteError(null);
                                        }}
                                        placeholder="https://beatboxpredictions.com/groups/join/…"
                                    />
                                </div>
                                {inviteError && <p className="notice" style={{ margin: 0 }}>{inviteError}</p>}
                                <div>
                                    <button className="btn" disabled={!invite.trim()}>
                                        {t('groups.join.submit')}
                                    </button>
                                </div>
                            </form>
                        </section>
                    </div>
                </div>
            )}

            {toast && <Toast message={toast.message} ok={toast.ok} onDismiss={() => setToast(null)} />}
        </div>
    );
}