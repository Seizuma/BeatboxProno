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
 * un lien doit voir où il entre avant qu'on lui demande de s'identifier. Le
 * serveur ne rend ici que le nom, la description, les compétitions suivies et
 * le nombre de membres — de quoi reconnaître le groupe, rien de plus.
 *
 * Le bouton Discord emporte la destination : après la connexion, on revient
 * sur cette invitation, pas sur « mes pronostics ».
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

    return (
        <div className="grp stack" data-accent={invite.accent} style={{ maxWidth: '36rem' }}>
            <header className="grp__bar">
                <span className="grp__sigil">{t('join.eyebrow')}</span>
                <h1 className="grp__name">{invite.name}</h1>
            </header>

            {invite.description && <p className="muted">{invite.description}</p>}

            <p className="grp__meta">{t('join.members', { n: invite.memberCount })}</p>
            {invite.events.length > 0 && (
                <p className="grp__meta">{t('join.scope', { events: invite.events.join(' · ') })}</p>
            )}

            {error && <p className="notice">{error}</p>}

            {!user ? (
                <>
                    <p className="muted">{t('join.signin')}</p>
                    <p><DiscordButton next={`/groups/join/${code}`} /></p>
                </>
            ) : invite.alreadyMember ? (
                <>
                    <p className="notice notice--ok">{t('join.already')}</p>
                    <p>
                        <Link className="btn btn--primary" to={`/groups/${invite.slug}`}>
                            {t('join.open')}
                        </Link>
                    </p>
                </>
            ) : invite.atLimit ? (
                // Le quota se dit ICI, avant la tentative : découvrir qu'on est à cinq
                // groupes après un aller-retour Discord est le pire moment pour
                // l'apprendre.
                <p className="notice">{t('join.limit', { max: invite.maxGroups })}</p>
            ) : invite.full ? (
                <p className="notice">{t('join.full')}</p>
            ) : !invite.open ? (
                <p className="notice">{t('join.closed')}</p>
            ) : (
                <p>
                    <button className="btn btn--primary" disabled={busy} onClick={join}>
                        {t('join.accept')}
                    </button>
                </p>
            )}
        </div>
    );
}