import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSession } from '../lib/context.jsx';
import DiscordButton from '../components/DiscordButton.jsx';

/**
 * La page d'une invitation.
 *
 * Elle s'affiche avant la connexion, et c'est le point : quelqu'un qui reçoit
 * un lien doit voir où il entre avant qu'on lui demande de s'identifier.
 *
 * Elle dit aussi ce que rejoindre IMPLIQUE, en clair et avant le bouton. Une
 * adhésion rend ses pronostics lisibles par des inconnus et fait entrer ses
 * points dans leur classement : découvrir ça après coup, c'est se sentir
 * exposé par un site auquel on faisait confiance. Quatre lignes suffisent, et
 * elles doivent précéder le geste, pas le suivre.
 */
export default function JoinGroup() {
    const { code } = useParams();
    const { t } = useI18n();
    const { user, loading } = useSession();
    const navigate = useNavigate();

    const [invite, setInvite] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setError(null);
        api
            .get(`/groups/join/${code}`)
            .then(({ invite }) => setInvite(invite))
            .catch(() => setError(t('join.invalid')));
        // `user` est dans les dépendances : après la connexion, la même invitation
        // doit être relue pour savoir si la personne en est déjà membre, et si son
        // quota lui permet d'entrer.
    }, [code, user, t]);

    const join = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const { slug } = await api.post(`/groups/join/${code}`);
            navigate(`/groups/${slug}`);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    if (loading) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    if (error && !invite) {
        return (
            <div className="empty" style={{ marginTop: '4rem' }}>
                <p>{error}</p>
                <Link className="btn" to="/groups">{t('groups.title')}</Link>
            </div>
        );
    }

    if (!invite) return <p className="faint" style={{ paddingTop: '2.5rem' }}>{t('common.loading')}</p>;

    // Le seul cas où l'on peut réellement entrer. Les autres — déjà membre,
    // complet, fermé, quota atteint — mènent chacun à un message précis plutôt
    // qu'à un bouton grisé qui ne dit pas pourquoi.
    const canJoin = user && !invite.alreadyMember && !invite.atLimit && !invite.full && invite.open;

    return (
        <div className="grp joinpage" data-accent={invite.accent}>
            <header className="grp__head">
                <div className="grp__bar">
                    <span className="grp__sigil">{t('join.eyebrow')}</span>
                    <h1 className="grp__name">{invite.name}</h1>
                </div>
                <div className="grp__strip">
                    <p className="grp__meta">{t('join.members', { n: invite.memberCount })}</p>
                    {invite.events.length > 0 && (
                        <p className="grp__meta">{t('join.scope', { events: invite.events.join(' · ') })}</p>
                    )}
                </div>
            </header>

            {invite.description && <p className="grp__note">{invite.description}</p>}

            {error && <p className="notice" style={{ marginTop: '1rem' }}>{error}</p>}

            {/* Ce que rejoindre implique — avant le bouton, toujours. */}
            <section className="joinwhat">
                <p className="grp__railhead">{t('join.what')}</p>
                <ul className="joinwhat__list">
                    <li>{t('join.what.standings')}</li>
                    <li>{t('join.what.picks')}</li>
                    <li>{t('join.what.private')}</li>
                    <li>{t('join.what.leave')}</li>
                </ul>
            </section>

            <div className="joinact">
                {!user ? (
                    <>
                        <p className="muted" style={{ marginTop: 0 }}>{t('join.signin')}</p>
                        <DiscordButton next={`/groups/join/${code}`} />
                    </>
                ) : invite.alreadyMember ? (
                    <>
                        <p className="notice notice--ok">{t('join.already')}</p>
                        <Link className="btn btn--primary" to={`/groups/${invite.slug}`}>
                            {t('join.open')}
                        </Link>
                    </>
                ) : invite.atLimit ? (
                    // Le quota se dit ICI, avant la tentative : découvrir qu'on est à
                    // cinq groupes après un aller-retour Discord est le pire moment.
                    <p className="notice">{t('join.limit', { max: invite.maxGroups })}</p>
                ) : invite.full ? (
                    <p className="notice">{t('join.full')}</p>
                ) : !invite.open ? (
                    <p className="notice">{t('join.closed')}</p>
                ) : null}

                {canJoin && (
                    <button className="btn btn--primary btn--wide" disabled={busy} onClick={join}>
                        {t('join.accept')}
                    </button>
                )}
            </div>
        </div>
    );
}