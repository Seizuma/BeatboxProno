import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useSession, isStaff } from '../lib/context.jsx';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import DiscordButton from './DiscordButton.jsx';
import NotificationBell from './NotificationBell.jsx';
import SearchDrawer, { GlassIcon } from './SearchDrawer.jsx';
import { FramedAvatar } from './Cosmetics.jsx';

/* ---------------------------------------------------------------------------
   L'habillage P411. L'en-tête est la ligne de service d'un décodeur
   télétexte : numéro de page à gauche, horloge en direct à droite, et une
   navigation en pavés pleine largeur.
   Les numéros ne sont pas décoratifs : ils identifient les pages, comme
   les vraies pages 411, 412, 413 des services de résultats sportifs.
   --------------------------------------------------------------------------- */


/**
 * Vrai sur la préproduction. La valeur est figée au build par Vite, depuis
 * l'argument VITE_APP_ENV du Dockerfile — elle ne peut donc pas être vraie par
 * accident en production, où l'argument vaut « prod ».
 */
const IS_DEV_ENV = import.meta.env.VITE_APP_ENV === 'dev';

export default function Layout() {
  const { user } = useSession();
  const { t } = useI18n();
  const { pathname } = useLocation();
  // Le tiroir de recherche. Monté dans la mise en page et non dans une page :
  // on cherche depuis n'importe où, et un composant par page en ferait cinq
  // copies à tenir d'accord.
  const [searching, setSearching] = useState(false);
  /**
   * La fermeture ANIMÉE du tiroir, prêtée par lui.
   *
   * Sans elle, la loupe n'aurait que `setSearching(false)` : le tiroir
   * disparaîtrait d'un coup, alors qu'il se replie partout ailleurs — clic à
   * côté, Échap, croix. C'est le tiroir qui sait combien de temps dure son
   * repli, pas l'en-tête.
   */
  const foldSearch = useRef(null);

  /**
   * La signalisation de la préproduction : le titre de l'onglet, et l'icône.
   *
   * L'icône se change ICI plutôt que dans `index.html` parce que ce fichier est
   * statique — nginx sert le même dans les deux environnements, et Vite n'y
   * substitue que des variables, pas des lignes entières. Or c'est justement
   * dans l'onglet qu'on confond les deux sites : le titre s'y tronque à quinze
   * caractères, l'icône non.
   *
   * Le remplacement est sûr à répéter : « favicon-dev-16.png » ne correspond
   * plus au motif, donc un second passage — StrictMode en fait un — ne produit
   * pas « favicon-dev-dev-16.png ».
   */
  useEffect(() => {
    if (!IS_DEV_ENV) return;
    document.title = 'DEV — beatboxpredictions';
    for (const link of document.querySelectorAll('link[rel="icon"]')) {
      const href = link.getAttribute('href');
      link.setAttribute('href', href.replace(/favicon-(\d+)\.png$/, 'favicon-dev-$1.png'));
    }
    const touch = document.querySelector('link[rel="apple-touch-icon"]');
    if (touch) {
      const href = touch.getAttribute('href');
      touch.setAttribute('href', href.replace(/icon\.png$/, 'icon-dev.png'));
    }
  }, []);

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="wordmark">
            <span className="wordmark__name">beatbox<em>predictions</em></span>
            {IS_DEV_ENV && <span className="tag tag--now">dev</span>}
          </Link>

          <Clock />

          <span className="nav__aside">
            <LangSwitch />
            {user ? (
              <>
                {/* La cloche avant l'avatar : c'est elle qui appelle, et on la
                    cherche du côté droit par habitude. */}
                <NotificationBell />
                {/* La photo mène à ses pronostics : c'est le geste attendu, et
                    ça évite de chercher l'entrée de menu.

                    La déconnexion n'est plus ici. Sur téléphone elle occupait
                    une place que la ligne de service n'a pas, et elle voisinait
                    l'avatar — deux cibles de quarante pixels côte à côte, dont
                    l'une ferme la session. Elle vit désormais sur le profil,
                    avec le reste de ce qui touche au compte. */}
                <Link to="/me" title={t('nav.mine')} aria-label={t('nav.mine')}>
                  {user.avatarUrl ? (
                    /* Le cadre acheté se porte ici aussi : c'est le seul endroit
                       du site que l'on voit sur toutes les pages, et un objet
                       payé qui ne se montrerait que sur son propre profil ne
                       vaudrait pas ses points. `avatar--link` reste pour la
                       règle de survol qui la vise nommément. */
                    <FramedAvatar
                      url={user.avatarUrl}
                      frameId={user.equippedFrame}
                      size="xs"
                      className="avatar--link"
                    />
                  ) : (
                    <span className="tag">{t('nav.mine')}</span>
                  )}
                </Link>
              </>
            ) : (
              <DiscordButton small>Discord</DiscordButton>
            )}
          </span>
        </div>

        {/* Les pavés occupent des colonnes de largeur égale, dimensionnées sur
            le libellé le plus long des deux langues. La géométrie ne dépend
            donc ni de la langue ni du contenu — et rien n'est jamais tronqué :
            s'il manque de la place, la rangée passe à la ligne. */}
        <div className="masthead__nav">
          <nav className="nav">
            <span className="nav__links">
              <NavLink to="/" end>{t('nav.events')}</NavLink>
              <NavLink to="/leaderboard">{t('nav.leaderboard')}</NavLink>
              <NavLink to="/artists">{t('nav.artists')}</NavLink>
              {/* Les groupes ne s'affichent que connecté : déconnecté, la page
                  n'aurait rien à montrer. */}
              {user && <NavLink to="/groups">{t('nav.groups')}</NavLink>}
              {user && <NavLink to="/me">{t('nav.mine')}</NavLink>}
              {isStaff(user) && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
            </span>

            {/* La loupe est HORS de `nav__links` : cette grille répartit des
                colonnes de largeur égale, et une icône carrée y prendrait la
                place d'un intitulé. Elle se pose au bout de la rangée, à la
                largeur de son dessin.

                Un <button> et non un lien : la recherche n'a pas d'adresse à
                elle, et lui en donner une obligerait à gérer un retour arrière
                qui ne rouvre rien. */}
            <button
              type="button"
              className="nav__search"
              aria-expanded={searching}
              aria-label={t('search.open')}
              title={t('search.open')}
              onClick={() => (searching ? foldSearch.current?.() : setSearching(true))}
            >
              <GlassIcon size={15} />
            </button>
          </nav>
        </div>
      </header>

      {searching && (
        <SearchDrawer
          onClose={() => setSearching(false)}
          onReady={(fold) => {
            foldSearch.current = fold;
          }}
        />
      )}

      {/* L'administration s'élargit, les pages de lecture non.

          980 px conviennent à une colonne de texte — c'est même ce qui la rend
          lisible. L'administration n'est pas du texte : c'est un rail, des
          tableaux et des grilles, qui gagnent tous à s'étaler. Le choix se fait
          sur le CHEMIN plutôt que par une prop remontée depuis la page : la
          largeur est une propriété de la mise en page, et la faire décider par
          le contenu obligerait chaque page à en avoir conscience. */}
      <main className={`shell${pathname.startsWith('/admin') ? ' shell--wide' : ''}`}>
        <Outlet />
      </main>

      <footer className="shell" style={{ paddingBottom: '2.5rem', paddingTop: '2rem' }}>
        <p className="silkscreen" style={{ margin: '0.5rem 0 0' }}>
          beatboxpredictions — {t('footer.tagline')}
        </p>
        {/* La politique de confidentialité se trouve depuis n'importe quelle
            page : c'est le seul endroit où l'on explique ce que le site retient
            et comment le faire effacer. */}
        <p className="silkscreen" style={{ margin: '0.4rem 0 0' }}>
          <Link to="/privacy">{t('footer.privacy')}</Link>
        </p>
        {/* La signature. Le cœur est un emoji, donc invisible aux lecteurs
            d'écran s'il reste nu : `role="img"` et son libellé le rendent
            audible. `rel="noopener"` est nécessaire sur toute cible _blank —
            sans lui la page ouverte garde une prise sur celle-ci.

            Deux noms depuis que cimak travaille sur le site. La conjonction est
            une clé de dictionnaire et non un « et » écrit ici : elle sépare
            deux liens, et l'anglais l'écrit autrement.

            cimak n'a pas de page à lui : son nom reste du texte. Le jour où il
            en aura une, remplacer le <span> par le même <a> que Seizuma suffit
            — rien d'autre à toucher. */}
        <p className="silkscreen footer__sign" style={{ margin: '0.9rem 0 0' }}>
          {t('footer.madeby.before')}
          <span className="footer__heart" role="img" aria-label={t('footer.madeby.heart')}>
            ❤️
          </span>
          {t('footer.madeby.after')}
          <a href="https://seizuma.com" target="_blank" rel="noopener noreferrer">
            Seizuma
          </a>
          {t('footer.madeby.and')}
          <span>cimak</span>
        </p>
      </footer>
    </>
  );
}

/**
 * L'horloge de la ligne de service, à la seconde près. C'est elle qui fait
 * respirer l'écran : le télétexte est vivant parce que l'heure tourne.
 */
function Clock() {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const day = now
    .toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase()
    .replace(/\./g, '');
  const time = now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <span className="clock" aria-hidden="true">
      {day} {time}
    </span>
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