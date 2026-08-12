import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import DiscordButton from './DiscordButton.jsx';

/* ---------------------------------------------------------------------------
   L'habillage P411. L'en-tête est la ligne de service d'un décodeur
   télétexte : numéro de page à gauche, horloge en direct à droite, et une
   navigation en pavés pleine largeur.
   Les numéros ne sont pas décoratifs : ils identifient les pages, comme
   les vraies pages 411, 412, 413 des services de résultats sportifs.
   --------------------------------------------------------------------------- */


export default function Layout() {
  const { user, logout } = useSession();
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="wordmark">
            <span className="wordmark__name">beatbox<em>predictions</em></span>
          </Link>

          <Clock />

          <span className="nav__aside">
            <LangSwitch />
            {user ? (
              <>
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