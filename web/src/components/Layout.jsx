import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import DiscordButton from './DiscordButton.jsx';

/* ---------------------------------------------------------------------------
   L'habillage P411. L'en-tête est la ligne de service d'un décodeur
   télétexte : numéro de page à gauche, horloge en direct à droite, et une
   navigation en pavés fastext dont chaque destination porte son numéro.
   Les numéros ne sont pas décoratifs : ils identifient les pages, comme
   les vraies pages 411, 412, 413 des services de résultats sportifs.
   --------------------------------------------------------------------------- */

const PAGES = {
  '/': '411',
  '/leaderboard': '412',
  '/stats': '413',
  '/artists': '414',
  '/me': '415',
  '/admin': '499',
};

export default function Layout() {
  const { user, logout } = useSession();
  const { t } = useI18n();
  const { pathname } = useLocation();

  // La page courante, pour la ligne de service (les sous-pages héritent).
  const page =
    Object.entries(PAGES).find(([path]) => path !== '/' && pathname.startsWith(path))?.[1] ??
    PAGES[pathname] ??
    '411';

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="wordmark">
            <span className="wordmark__mark">P{page}</span>
            <span className="wordmark__name">beatbox<em>predictions</em></span>
          </Link>

          <Clock />

          <nav className="nav">
            <NavLink to="/" end data-page="411">{t('nav.events')}</NavLink>
            <NavLink to="/leaderboard" data-page="412">{t('nav.leaderboard')}</NavLink>
            <NavLink to="/stats" data-page="413">{t('nav.stats')}</NavLink>
            <NavLink to="/artists" data-page="414">{t('nav.artists')}</NavLink>
            {user && <NavLink to="/me" data-page="415">{t('nav.mine')}</NavLink>}
            {isStaff(user) && <NavLink to="/admin" data-page="499">{t('nav.admin')}</NavLink>}

            <LangSwitch />

            {user ? (
              <span className="row" style={{ gap: '0.45rem', marginLeft: '0.35rem' }}>
                {user.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
                <button className="btn btn--small btn--ghost" onClick={logout}>
                  {t('nav.logout')}
                </button>
              </span>
            ) : (
              <span style={{ marginLeft: '0.35rem' }}>
                <DiscordButton small>Discord</DiscordButton>
              </span>
            )}
          </nav>
        </div>
        <div className="railstripe" aria-hidden="true" />
      </header>

      <main className="shell">
        <Outlet />
      </main>

      <footer className="shell" style={{ paddingBottom: '2.5rem' }}>
        <div className="railstripe" aria-hidden="true" style={{ marginTop: '2rem' }} />
        <div className="fastext" aria-hidden="true">
          <span className="k-r">{t('nav.events')}</span>
          <span className="k-g">{t('nav.leaderboard')}</span>
          <span className="k-y">{t('nav.stats')}</span>
          <span className="k-c">{t('nav.artists')}</span>
        </div>
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