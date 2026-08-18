import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import DiscordButton from './DiscordButton.jsx';
import NotificationBell from './NotificationBell.jsx';

/* ---------------------------------------------------------------------------
   L'habillage P411. L'en-tête est la ligne de service d'un décodeur
   télétexte : numéro de page à gauche, horloge en direct à droite, et une
   navigation en pavés pleine largeur.
   Les numéros ne sont pas décoratifs : ils identifient les pages, comme
   les vraies pages 411, 412, 413 des services de résultats sportifs.
   --------------------------------------------------------------------------- */


/**
 * Vrai sur la préproduction. La valeur est figée au build par Vite, depuis
 * l'argument VITE_APP_ENV du Dockerfile — elle ne peut donc pas être vraie par
 * accident en production, où l'argument vaut « prod ».
 *
 * Sans ce repère, deux onglets ouverts côte à côte sont indiscernables : on
 * finit par saisir un résultat de test dans la vraie base.
 */
const IS_DEV_ENV = import.meta.env.VITE_APP_ENV === 'dev';

export default function Layout() {
  const { user, logout } = useSession();
  const { t } = useI18n();
  const { pathname } = useLocation();

  // Le titre de l'onglet aussi : c'est ce qu'on lit quand la fenêtre est
  // réduite, donc là où la confusion coûte le plus cher.
  useEffect(() => {
    if (IS_DEV_ENV) document.title = 'DEV — beatboxpredictions';
  }, []);

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="wordmark">
            <span className="wordmark__name">beatbox<em>predictions</em></span>
            {IS_DEV_ENV && <span className="tag tag--now">dev</span>}
          </Link>

          <Clock />

          <span className="nav__aside">
            <LangSwitch />
            {user ? (
              <>
                {/* La cloche avant l'avatar : c'est elle qui appelle, et on la
                    cherche du côté droit par habitude. */}
                <NotificationBell />
                {/* La photo mène à ses pronostics : c'est le geste attendu, et
                    ça évite de chercher l'entrée de menu. */}
                <Link to="/me" title={t('nav.mine')} aria-label={t('nav.mine')}>
                  {user.avatarUrl ? (
                    <img className="avatar avatar--link" src={user.avatarUrl} alt="" />
                  ) : (
                    <span className="tag">{t('nav.mine')}</span>
                  )}
                </Link>
                <button className="btn btn--small btn--ghost" onClick={logout}>
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <DiscordButton small>Discord</DiscordButton>
            )}
          </span>
        </div>

        {/* Les pavés occupent des colonnes de largeur égale, dimensionnées sur
            le libellé le plus long des deux langues. La géométrie ne dépend
            donc ni de la langue ni du contenu — et rien n'est jamais tronqué :
            s'il manque de la place, la rangée passe à la ligne. */}
        <div className="masthead__nav">
          <nav className="nav">
            <span className="nav__links">
              <NavLink to="/" end>{t('nav.events')}</NavLink>
              <NavLink to="/leaderboard">{t('nav.leaderboard')}</NavLink>
              <NavLink to="/artists">{t('nav.artists')}</NavLink>
              {/* Les groupes ne s'affichent que connecté : déconnecté, la page
                  n'aurait rien à montrer, et un cercle privé n'a pas à figurer
                  dans la navigation de quelqu'un qui n'en a aucun. */}
              {user && <NavLink to="/groups">{t('nav.groups')}</NavLink>}
              {user && <NavLink to="/me">{t('nav.mine')}</NavLink>}
              {isStaff(user) && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
            </span>
          </nav>
        </div>
      </header>

      <main className="shell">
        <Outlet />
      </main>

      <footer className="shell" style={{ paddingBottom: '2.5rem', paddingTop: '2rem' }}>
        <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
          beatboxpredictions — {t('footer.tagline')}
        </p>
        {/* La politique de confidentialité se trouve depuis n'importe quelle
            page : c'est le seul endroit où l'on explique ce que le site retient
            et comment le faire effacer. */}
        <p className="silkscreen" style={{ margin: '0.4rem 0 0' }}>
          <Link to="/privacy">{t('footer.privacy')}</Link>
        </p>
        {/* La signature. Le cœur est un emoji, donc invisible aux lecteurs
            d'écran s'il reste nu : `role="img"` et son libellé le rendent
            audible. `rel="noopener"` est nécessaire sur toute cible _blank —
            sans lui la page ouverte garde une prise sur celle-ci. */}
        <p className="silkscreen footer__sign" style={{ margin: '0.9rem 0 0' }}>
          {t('footer.madeby.before')}
          <span className="footer__heart" role="img" aria-label={t('footer.madeby.heart')}>
            ❤️
          </span>
          {t('footer.madeby.after')}
          <a href="https://seizuma.com" target="_blank" rel="noopener noreferrer">
            Seizuma
          </a>
        </p>
      </footer>
    </>
  );
}

/**
 * L'horloge de la ligne de service, à la seconde près. C'est elle qui fait
 * respirer l'écran : le télétexte est vivant parce que l'heure tourne.
 */
function Clock() {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const day = now
    .toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase()
    .replace(/\./g, '');
  const time = now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <span className="clock" aria-hidden="true">
      {day} {time}
    </span>
  );
}

function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <span className="langswitch" role="group" aria-label={t('nav.language')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id)}
          aria-pressed={l.id === lang}
          title={l.name}
        >
          {l.label}
        </button>
      ))}
    </span>
  );
}