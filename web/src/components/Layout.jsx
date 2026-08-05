import { NavLink, Link, Outlet } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import DiscordButton from './DiscordButton.jsx';

export default function Layout() {
  const { user, logout } = useSession();
  const { t } = useI18n();

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="wordmark">
            <span className="wordmark__mark">{t('brand.mark')}</span>
            <span className="wordmark__name">beatbox<em>predictions</em></span>
          </Link>

          <nav className="nav">
            <NavLink to="/" end>{t('nav.events')}</NavLink>
            <NavLink to="/leaderboard">{t('nav.leaderboard')}</NavLink>
            <NavLink to="/stats">{t('nav.stats')}</NavLink>
            <NavLink to="/artists">{t('nav.artists')}</NavLink>
            {user && <NavLink to="/me">{t('nav.mine')}</NavLink>}
            {isStaff(user) && <NavLink to="/admin">{t('nav.admin')}</NavLink>}

            <LangSwitch />

            {user ? (
              <span className="row" style={{ gap: '0.5rem', marginLeft: '0.5rem' }}>
                {user.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
                <button className="btn btn--small btn--ghost" onClick={logout}>
                  {t('nav.logout')}
                </button>
              </span>
            ) : (
              <span style={{ marginLeft: '0.5rem' }}>
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
        <div className="railstripe" aria-hidden="true" style={{ marginBottom: '1rem' }} />
        <p className="silkscreen" style={{ margin: 0 }}>
          beatboxpredictions — {t('footer.tagline')}
        </p>
      </footer>
    </>
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
