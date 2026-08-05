import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider, ThemeProvider } from './lib/context.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import App from './App.jsx';
import './styles/app.css';
import './styles/board.css'; // charge après app.css : les règles de tableau gagnent

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
