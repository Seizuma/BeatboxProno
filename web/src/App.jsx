import { Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import EventPage from './pages/EventPage.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import PlayerStats from './pages/PlayerStats.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';
import { ArtistList, ArtistPage } from './pages/Artists.jsx';
import { useI18n } from './lib/i18n.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="events/:slug" element={<EventPage />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="stats" element={<PlayerStats />} />
        <Route path="artists" element={<ArtistList />} />
        <Route path="artists/:slug" element={<ArtistPage />} />
        <Route path="me" element={<Profile />} />
        <Route path="players/:id" element={<Profile />} />
        <Route path="admin" element={<Admin />} />

        {/* Les anciennes adresses françaises restent valides. */}
        <Route path="evenements/:slug" element={<Moved to="/events" />} />
        <Route path="classement" element={<Navigate to="/leaderboard" replace />} />
        <Route path="artistes" element={<Navigate to="/artists" replace />} />
        <Route path="artistes/:slug" element={<Moved to="/artists" />} />
        <Route path="moi" element={<Navigate to="/me" replace />} />
        <Route path="profil/:id" element={<Moved to="/players" param="id" />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/** Redirige /artistes/alem vers /artists/alem sans perdre le segment. */
function Moved({ to, param = 'slug' }) {
  const params = useParams();
  return <Navigate to={`${to}/${params[param]}`} replace />;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="empty" style={{ marginTop: '4rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>{t('notfound.title')}</h2>
      <p>{t('notfound.lede')}</p>
      <Link className="btn" to="/">
        {t('common.back')}
      </Link>
    </div>
  );
}
