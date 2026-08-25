import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { LATEST_RELEASE, unreadReleases } from '../lib/releases.js';
import ReleaseNotes from './ReleaseNotes.jsx';

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
 *
 * ─── Deux natures dans le même panneau ───────────────────────────────────────
 *
 * Les notifications sont des ÉVÉNEMENTS : elles s'accumulent, se marquent une
 * par une, et n'ont plus d'intérêt une fois lues. Le journal des nouveautés est
 * un DOCUMENT : il ne s'accumule pas, il s'allonge, et reste consultable
 * indéfiniment. D'où son traitement à part — une entrée permanente en tête du
 * panneau, qui cesse simplement de compter dans la pastille une fois ouverte.
 */
const POLL_MS = 90_000;

export default function NotificationBell() {
  const { t, date } = useI18n();
  const navigate = useNavigate();

  const [data, setData] = useState({ unread: 0, notifications: [], lastReadRelease: null });
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState(false);
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
   * La phrase d'un avis.
   *
   * `EVENT_OPEN` ne cite personne : c'est le site qui parle, son `actorId` est
   * vide. Les autres nomment leur auteur, avec un repli lisible quand le compte
   * a été supprimé depuis.
   */
  const label = (n) => {
    if (n.kind === 'EVENT_OPEN') {
      return t('notif.EVENT_OPEN', {
        event: n.event ? `${n.event.name} ${n.event.year}` : '—',
      });
    }
    return t(`notif.${n.kind}`, {
      name: n.actor?.globalName ?? n.actor?.username ?? t('notif.someone'),
      group: n.group?.name ?? '—',
    });
  };

  /**
   * Ouvre l'avis : on marque comme lu ET on se rend à destination.
   *
   * Les deux ensemble, parce qu'un avis qu'on vient de suivre n'a plus rien à
   * signaler. L'état local est mis à jour sans attendre la réponse — la
   * pastille doit tomber au clic, pas à l'aller-retour.
   *
   * La destination dépend de ce que l'avis désigne : un groupe pour les
   * commentaires et les arrivées, un événement pour une ouverture. L'ordre
   * compte peu ici, un avis ne portant jamais les deux.
   */
  const openOne = async (n) => {
    setOpen(false);
    if (!n.read) {
      setData((d) => ({
        ...d,
        unread: Math.max(0, d.unread - 1),
        notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      }));
      api.post(`/notifications/${n.id}/read`).catch(() => { });
    }

    if (n.event?.slug) navigate(`/events/${n.event.slug}`);
    else if (n.group?.slug) navigate(`/groups/${n.group.slug}`);
  };

  /**
   * Ouvre le journal, et le marque lu jusqu'à la note la plus récente.
   *
   * Marqué à l'OUVERTURE et non à la fermeture : quelqu'un qui ferme l'onglet
   * en cours de lecture a quand même vu l'annonce. Le document restant
   * accessible en permanence, rien n'est perdu s'il n'a pas tout lu.
   */
  const openNews = () => {
    setOpen(false);
    setNews(true);
    if (!LATEST_RELEASE) return;
    setData((d) => ({ ...d, lastReadRelease: LATEST_RELEASE }));
    api.post('/notifications/release', { id: LATEST_RELEASE }).catch(() => { });
  };

  const freshNews = unreadReleases(data.lastReadRelease);
  const badge = data.unread + freshNews;

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
        {badge > 0 && <span className="bell__dot">{badge > 9 ? '9+' : badge}</span>}
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

          {/* Le journal, toujours en tête et toujours présent. Contrairement aux
              avis, il ne s'efface pas une fois lu : il perd seulement sa
              marque. */}
          <button
            type="button"
            className={`notif${freshNews ? ' notif--new' : ''}`}
            onClick={openNews}
          >
            <span aria-hidden="true">★</span>
            <span className="notif__text">
              {t('news.title')}
              <span className="notif__when">
                {freshNews ? t('news.unread', { n: freshNews }) : t('news.reread')}
              </span>
            </span>
          </button>

          {data.notifications.length === 0 ? (
            <p className="empty" style={{ margin: '0.5rem 0 0' }}>{t('notif.empty')}</p>
          ) : (
            <ul className="notifs__list">
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif${n.read ? '' : ' notif--new'}`}
                    onClick={() => openOne(n)}
                  >
                    {/* Une ouverture n'a pas d'avatar : c'est le site qui
                        parle. Un glyphe tient la colonne pour que les lignes
                        restent alignées. */}
                    {n.kind === 'EVENT_OPEN' ? (
                      <span aria-hidden="true">▶</span>
                    ) : (
                      n.actor?.avatarUrl && <img className="avatar" src={n.actor.avatarUrl} alt="" />
                    )}
                    <span className="notif__text">
                      {label(n)}
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

      {news && (
        <ReleaseNotes lastReadRelease={data.lastReadRelease} onClose={() => setNews(false)} />
      )}
    </span>
  );
}