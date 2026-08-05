import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

// --- Session ------------------------------------------------------------------

const SessionContext = createContext({ user: null, loading: true, refresh: () => {} });

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

// Loop est la direction retenue. Les deux autres restent disponibles :
// changez la valeur par défaut ci-dessous et data-theme dans index.html.
export const THEMES = [
  { id: 'fiche', name: 'Fiche', hint: 'La feuille de notation du juge', swatch: '#b3282b', bg: '#dfe3dd' },
  { id: 'loop', name: 'Loop', hint: 'La face avant d’une loopstation', swatch: '#b98a2e', bg: '#1b1d1e' },
  { id: 'affiche', name: 'Affiche', hint: 'Le placard collé avant la compète', swatch: '#232fb4', bg: '#efebe1' },
];

const ThemeContext = createContext({ theme: 'fiche', setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('bbp-theme') ?? 'loop'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bbp-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
