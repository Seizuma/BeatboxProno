import { NavLink, Link, Outlet } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import { api } from '../lib/api.js';

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
              <span className="row" style={{ gap: '0.5rem', marginLeft: '0.5rem' }}>
                {user.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
                <button className="btn btn--small btn--ghost" onClick={logout}>
                  Se déconnecter
                </button>
              </span>
            ) : (
              <a className="btn btn--primary btn--small" href={api.loginUrl} style={{ marginLeft: '0.5rem' }}>
                Se connecter avec Discord
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="shell">
        <Outlet />
      </main>
    </>
  );
}
