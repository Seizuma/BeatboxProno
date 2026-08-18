import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

/**
 * La cloche.
 *
 * Un relevé toutes les 90 secondes plutôt qu'une connexion permanente : les
 * avis ici ne sont pas urgents — savoir qu'on a commenté votre pronostic peut
 * attendre une minute et demie. Un WebSocket coûterait une infrastructure
 * entière pour gagner ce délai.
 *
 * Le relevé s'interrompt quand l'onglet passe en arrière-plan. Sans ça, dix
 * onglets oubliés interrogent le serveur toute la journée pour un écran que
 * personne ne regarde.
 */
const POLL_MS = 90_000;

export default function NotificationBell() {
    const { t, date } = useI18n();
    const navigate = useNavigate();

    const [data, setData] = useState({ unread: 0, notifications: [] });
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);

    const load = useCallback(() => {
        api.get('/notifications').then(setData).catch(() => { });
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') load();
        }, POLL_MS);

        // Au retour sur l'onglet, on relève tout de suite : attendre le prochain
        // battement afficherait une pastille périmée pendant une minute et demie.
        const onVisible = () => {
            if (document.visibilityState === 'visible') load();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    // Fermeture au clic extérieur et à Échap : un panneau qu'on ne sait pas
    // fermer autrement qu'en recliquant sur son bouton est une impasse.
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const markAll = async () => {
        await api.post('/notifications/read').catch(() => { });
        load();
    };

    /**
     * Ouvre l'avis : on marque comme lu ET on se rend à destination.
     *
     * Les deux ensemble, parce qu'un avis qu'on vient de suivre n'a plus rien à
     * signaler. L'état local est mis à jour sans attendre la réponse — la
     * pastille doit tomber au clic, pas à l'aller-retour.
     */
    const openOne = async (n) => {
        setOpen(false);
        if (!n.read) {
            setData((d) => ({
                unread: Math.max(0, d.unread - 1),
                notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
            }));
            api.post(`/notifications/${n.id}/read`).catch(() => { });
        }
        if (n.group?.slug) navigate(`/groups/${n.group.slug}`);
    };

    return (
        <span className="bell" ref={wrap}>
            <button
                type="button"
                className="bell__btn"
                aria-label={t('notif.title')}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                {/* Une cloche dessinée en caractères plutôt qu'une icône importée :
            l'identité du site est typographique, et un SVG de plus alourdirait
            le paquet pour un glyphe de seize pixels. */}
                <span aria-hidden="true">◉</span>
                {data.unread > 0 && <span className="bell__dot">{data.unread > 9 ? '9+' : data.unread}</span>}
            </button>

            {open && (
                <div className="notifs" role="dialog" aria-label={t('notif.title')}>
                    <div className="notifs__head">
                        <span className="bubble__title">{t('notif.title')}</span>
                        {data.unread > 0 && (
                            <button className="btn btn--small btn--ghost" onClick={markAll}>
                                {t('notif.markAll')}
                            </button>
                        )}
                    </div>

                    {data.notifications.length === 0 ? (
                        <p className="empty" style={{ margin: 0 }}>{t('notif.empty')}</p>
                    ) : (
                        <ul className="notifs__list">
                            {data.notifications.map((n) => (
                                <li key={n.id}>
                                    <button
                                        type="button"
                                        className={`notif${n.read ? '' : ' notif--new'}`}
                                        onClick={() => openOne(n)}
                                    >
                                        {n.actor?.avatarUrl && <img className="avatar" src={n.actor.avatarUrl} alt="" />}
                                        <span className="notif__text">
                                            {t(`notif.${n.kind}`, {
                                                // Un compte supprimé laisse ses avis derrière lui, sans
                                                // nom : la phrase doit rester lisible.
                                                name: n.actor?.globalName ?? n.actor?.username ?? t('notif.someone'),
                                                group: n.group?.name ?? '—',
                                            })}
                                            <span className="notif__when">
                                                {date(n.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </span>
    );
}