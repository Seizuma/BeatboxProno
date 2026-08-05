import { NavLink, Link, Outlet } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import DiscordButton from './DiscordButton.jsx';

export default function Layout() {
  const { user, logout } = useSession();

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="wordmark">
            <span className="wordmark__mark">3-0</span>
            Pronos Beatbox
          </Link>

          <nav className="nav">
            <NavLink to="/" end>Événements</NavLink>
            <NavLink to="/classement">Classement</NavLink>
            <NavLink to="/artistes">Artistes</NavLink>
            {user && <NavLink to="/moi">Mes pronostics</NavLink>}
            {isStaff(user) && <NavLink to="/admin">Administration</NavLink>}

            {user ? (
              <span className="row" style={{ gap: '0.5rem', marginLeft: '0.75rem' }}>
                {user.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
                <button className="btn btn--small btn--ghost" onClick={logout}>
                  Se déconnecter
                </button>
              </span>
            ) : (
              <span style={{ marginLeft: '0.75rem' }}>
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
          Pronos Beatbox — les pronostics ferment au coup d’envoi de chaque phase
        </p>
      </footer>
    </>
  );
}
