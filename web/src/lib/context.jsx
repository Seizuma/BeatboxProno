import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

// --- Session ------------------------------------------------------------------

const SessionContext = createContext({ user: null, loading: true, refresh: () => { } });

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
export const isStaff = (user) => Boolean(user && ['ADMIN', 'MODERATOR'].includes(user.role));

// --- Thème --------------------------------------------------------------------

// P411 est l'identité du site : le télétexte des résultats sportifs.
// Il n'y a plus qu'un thème — les anciens (fiche/loop/affiche) sont retirés
// de themes.css. La liste reste un tableau pour rouvrir la porte un jour.
export const THEMES = [
  { id: 'p411', name: 'Page 411', hint: 'Le télétexte des résultats sportifs', swatch: '#ffe400', bg: '#0b0b0b' },
];

const ThemeContext = createContext({ theme: 'p411', setTheme: () => { } });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Les visiteurs d'avant la refonte ont un ancien identifiant mémorisé :
    // on le migre silencieusement vers le seul thème existant.
    const saved = localStorage.getItem('bbp-theme');
    return THEMES.some((t) => t.id === saved) ? saved : 'p411';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bbp-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);