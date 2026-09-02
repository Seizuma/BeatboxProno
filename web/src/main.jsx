import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider, ThemeProvider } from './lib/context.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { installFrames } from './lib/frames.js';
import { installBadges } from './lib/badgeSprites.js';
import App from './App.jsx';

/* L'ordre compte : chaque feuille surcharge les précédentes à spécificité
   égale. app.css pose la base, board.css les plateaux, groups.css la coquille
   des cercles privés, shop.css la boutique et les cosmétiques, et mobile.css
   passe en dernier — c'est lui qui a le dernier mot sur petit écran, sans quoi
   il faudrait le truffer de `!important` pour reprendre la main sur des règles
   écrites pour le bureau. */
import './styles/app.css';
import './styles/board.css';
import './styles/groups.css';
import './styles/shop.css';
import './styles/mobile.css';

/* Les cadres d'avatar sont engendrés depuis leurs dessins et posés en une seule
   feuille. Appelé ICI, explicitement, plutôt qu'en effet de bord à l'import de
   `frames.js` : une feuille de styles qui apparaît parce qu'un module a été
   chargé quelque part est le genre de chose qu'on cherche pendant une heure.

   Avant le rendu, pour qu'aucun avatar ne s'affiche nu le temps d'une frame. */
installFrames();

/* Et les badges, pour la même raison : leurs vingt-quatre angles sont
   pré-calculés, la feuille ne fait que les nommer. Deux appels visibles valent
   mieux qu'un effet de bord à l'import qu'on cherche pendant une heure. */
installBadges();

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