import { Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import EventPage from './pages/EventPage.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';
import { ArtistList, ArtistPage } from './pages/Artists.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="evenements/:slug" element={<EventPage />} />
        <Route path="classement" element={<Leaderboard />} />
        <Route path="artistes" element={<ArtistList />} />
        <Route path="artistes/:slug" element={<ArtistPage />} />
        <Route path="moi" element={<Profile />} />
        <Route path="profil/:id" element={<Profile />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="empty" style={{ marginTop: '4rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Cette page n'existe pas</h2>
      <p>Le lien est peut-être périmé.</p>
      <Link className="btn" to="/">Revenir aux événements</Link>
    </div>
  );
}
