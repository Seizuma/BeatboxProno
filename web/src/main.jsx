import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider, ThemeProvider } from './lib/context.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import App from './App.jsx';

/* L'ordre compte : chaque feuille surcharge les précédentes à spécificité
   égale. app.css pose la base, board.css les plateaux, groups.css la coquille
   des cercles privés, et mobile.css passe en dernier — c'est lui qui a le
   dernier mot sur petit écran, sans quoi il faudrait le truffer de `!important`
   pour reprendre la main sur des règles écrites pour le bureau. */
import './styles/app.css';
import './styles/board.css';
import './styles/groups.css';
import './styles/mobile.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <SessionProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SessionProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);