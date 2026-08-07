import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ---------------------------------------------------------------------------
   Langue. L'anglais est la langue du site. On ne bascule en français que si le
   navigateur le demande — ou si la personne clique sur le sélecteur, auquel cas
   son choix est mémorisé et gagne sur le navigateur.
   --------------------------------------------------------------------------- */

export const LANGS = [
  { id: 'en', label: 'EN', name: 'English', locale: 'en-GB' },
  { id: 'fr', label: 'FR', name: 'Français', locale: 'fr-FR' },
];

const STORAGE_KEY = 'bbp-lang';

export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS.some((l) => l.id === saved)) return saved;
  } catch {
    /* navigation privée : on retombe sur le navigateur */
  }
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return tags.some((tag) => String(tag).toLowerCase().startsWith('fr')) ? 'fr' : 'en';
}

const DICT = {
  en: {
    'brand.name': 'beatboxpredictions',
    'brand.mark': '3-0',

    'nav.events': 'Events',
    'nav.leaderboard': 'Leaderboard',
    'nav.artists': 'Artists',
    'nav.stats': 'Stats',
    'nav.mine': 'My predictions',
    'nav.admin': 'Admin',
    'nav.logout': 'Sign out',
    'nav.language': 'Language',
    'nav.menu': 'Menu',

    'footer.tagline': 'Predictions close when each phase kicks off.',

    'common.loading': 'Loading…',
    'common.open': 'Open',
    'common.none': 'None',
    'common.points': 'points',
    'common.seed': 'Seed',
    'common.search': 'Search',
    'common.clear': 'Clear',
    'common.back': 'Back to events',

    'notfound.title': 'This page does not exist',
    'notfound.lede': 'The link may have expired.',

    'home.eyebrow': 'Beatbox predictions',
    'home.title.l1': 'Read the battles,',
    'home.title.l2a': 'not the ',
    'home.title.em': 'odds',
    'home.title.l2b': '.',
    'home.lede':
      'Build the wildcard ranking, draw the bracket up to the final, call the scores. Every good read pays — even when the matchup arrives from the other half of the tree.',
    'home.cta.predict': 'Predict {event}',
    'home.counter': 'predictions filed',
    'home.categories': '{event} — categories',
    'home.categories.empty': 'Categories',
    'home.events': 'Events',
    'home.events.count': '{n} on the calendar',
    'home.events.empty': 'No event published yet. Check back soon.',
    'home.auth.failed': 'Discord sign-in did not go through. Start it again from the button at the top right.',
    'home.venue.tbc': 'Venue to be confirmed',
    'home.predictions.short': 'preds',

    'status.DRAFT': 'Draft',
    'status.OPEN': 'Predictions open',
    'status.LIVE': 'Live',
    'status.FINISHED': 'Finished',

    'event.signin':
      'Sign in with Discord to file a prediction. You can browse and prepare your picks right away — they will be lost on reload.',
    'event.save.draft': 'Save draft',
    'event.save.submit': 'File prediction',
    'event.saved.draft': 'Draft saved.',
    'event.saved.submit': 'Prediction filed.',
    'event.editable': 'Editable until the phase closes.',
    'event.phase.resolved': 'Result known',
    'event.phase.closed': 'Closed',

    'rule.SEEDING': 'Placement gap only',
    'rule.WILDCARD': '+1 per qualifier, +1 to 5 per gap',
    'rule.ELIMINATION': '+1 per qualifier, +1 to 5 per gap',
    'rule.BRACKET': '+2 matchup, +2 winner, +2 score',
    'rule.LEGACY': '+2 matchup, +2 winner, +2 score',

    'ranking.title': 'Your ranking',
    'ranking.cut': '{n} qualify',
    'ranking.progress': '{placed} of {total} placed',
    'ranking.pool': 'To place',
    'ranking.pool.empty': 'Everyone is ranked.',
    'ranking.empty': 'Drag a name in from the right, or tap it to drop it at the bottom.',
    'ranking.cutline': 'Qualification line',
    'ranking.drop': 'Drop here',
    'ranking.remove': 'Remove {name}',
    'ranking.grab': 'Move {name}. Drag, or use the arrow keys.',
    'ranking.add': 'Place {name}',
    'ranking.fill': 'Fill by seed',
    'ranking.reset': 'Clear all',
    'ranking.hint': 'Drag to reorder. Arrow keys work too.',

    'bracket.round.ROUND_OF_16': 'Round of 16',
    'bracket.round.QUARTER': 'Quarter-finals',
    'bracket.round.SEMI': 'Semi-finals',
    'bracket.round.SMALL_FINAL': 'Small final',
    'bracket.round.FINAL': 'Final',
    'bracket.round.LEGACY': 'Legacy',
    'bracket.tbd': 'to be decided',
    'bracket.winner': 'Winner',
    'bracket.score': 'Score',
    'bracket.score.none': 'No call',
    'bracket.clear': 'Clear',

    'leaderboard.eyebrow': 'Who reads the battles best',
    'leaderboard.title': 'Leaderboard',
    'leaderboard.scope': 'Scope',
    'leaderboard.scope.all': 'All events',
    'leaderboard.empty': 'No prediction scored in this scope yet.',
    'leaderboard.col.player': 'Player',
    'leaderboard.col.predictions': 'Predictions',
    'leaderboard.col.points': 'Points',
    'leaderboard.deleted': 'Deleted account',
    'leaderboard.tostats': 'See the detailed stats',

    'artists.eyebrow': 'Reusable from one event to the next',
    'artists.title': 'Artists',
    'artists.search': 'Search a name',
    'artists.empty': 'No artist matches.',
    'artists.unknown': 'Origin unknown',
    'artists.record': 'Battle record',
    'artists.podiums': 'Podiums',
    'artists.pickedToWin': 'Times picked to win',
    'artists.accuracy': 'Hit rate of those who picked them',
    'artists.appearances': 'Appearances',
    'artists.appearances.empty': 'Not entered in a recorded event yet.',
    'artists.col.event': 'Event',
    'artists.col.category': 'Category',
    'artists.col.as': 'Entered as',

    'profile.signin': 'Sign in to find your predictions.',
    'profile.member': 'Member since {date}',
    'profile.points': 'Points earned',
    'profile.scored': 'Predictions scored',
    'profile.pending': 'Awaiting results',
    'profile.drafts': 'Drafts',
    'profile.bucket.live': 'In play',
    'profile.bucket.done': 'Finished',
    'profile.bucket.drafts': 'Drafts',
    'profile.bucket.empty': 'Nothing here yet.',

    'stats.eyebrow': 'Every filed prediction, counted',
    'stats.title': 'Player stats',
    'stats.players': 'Players',
    'stats.predictions': 'Predictions filed',
    'stats.pointsGiven': 'Points awarded',
    'stats.battlesRead': 'Battles called right',
    'stats.table.title': 'Player by player',
    'stats.col.player': 'Player',
    'stats.col.predictions': 'Preds',
    'stats.col.points': 'Points',
    'stats.col.average': 'Avg / pred',
    'stats.col.accuracy': 'Battle accuracy',
    'stats.empty': 'Nothing to count yet — stats appear once results are published.',
    'stats.favourites': 'Crowd favourites',
    'stats.favourites.lede': 'Picked to win the final, all predictions combined.',
    'stats.favourites.count': '{n} picks',
    'stats.profile': 'Open profile',
  },

  fr: {
    'brand.name': 'beatboxpredictions',
    'brand.mark': '3-0',

    'nav.events': 'Événements',
    'nav.leaderboard': 'Classement',
    'nav.artists': 'Artistes',
    'nav.stats': 'Statistiques',
    'nav.mine': 'Mes pronostics',
    'nav.admin': 'Administration',
    'nav.logout': 'Se déconnecter',
    'nav.language': 'Langue',
    'nav.menu': 'Menu',

    'footer.tagline': 'Les pronostics ferment au coup d’envoi de chaque phase.',

    'common.loading': 'Chargement…',
    'common.open': 'Ouvrir',
    'common.none': 'Aucun',
    'common.points': 'points',
    'common.seed': 'Seed',
    'common.search': 'Chercher',
    'common.clear': 'Effacer',
    'common.back': 'Revenir aux événements',

    'notfound.title': 'Cette page n’existe pas',
    'notfound.lede': 'Le lien est peut-être périmé.',

    'home.eyebrow': 'Pronostics beatbox',
    'home.title.l1': 'Lisez les battles,',
    'home.title.l2a': 'pas la ',
    'home.title.em': 'chance',
    'home.title.l2b': '.',
    'home.lede':
      'Composez le classement des wildcards, dessinez l’arbre jusqu’à la finale, annoncez les scores. Chaque bonne intuition rapporte, même quand l’affiche arrive par l’autre moitié du tableau.',
    'home.cta.predict': 'Pronostiquer {event}',
    'home.counter': 'pronostics déposés',
    'home.categories': '{event} — catégories',
    'home.categories.empty': 'Catégories',
    'home.events': 'Événements',
    'home.events.count': '{n} au calendrier',
    'home.events.empty': 'Aucun événement publié pour l’instant. Revenez bientôt.',
    'home.auth.failed': 'La connexion Discord n’a pas abouti. Relancez-la depuis le bouton en haut à droite.',
    'home.venue.tbc': 'Lieu à confirmer',
    'home.predictions.short': 'pronos',

    'status.DRAFT': 'Brouillon',
    'status.OPEN': 'Pronostics ouverts',
    'status.LIVE': 'En cours',
    'status.FINISHED': 'Terminé',

    'event.signin':
      'Connectez-vous avec Discord pour enregistrer un pronostic. Vous pouvez déjà tout parcourir et préparer vos choix, ils seront perdus au rechargement.',
    'event.save.draft': 'Enregistrer le brouillon',
    'event.save.submit': 'Déposer le pronostic',
    'event.saved.draft': 'Brouillon enregistré.',
    'event.saved.submit': 'Pronostic déposé.',
    'event.editable': 'Modifiable tant que la phase n’est pas fermée.',
    'event.phase.resolved': 'Résultat connu',
    'event.phase.closed': 'Fermée',

    'rule.SEEDING': 'Écart de placement seul',
    'rule.WILDCARD': '+1 par qualifié, +1 à 5 par écart',
    'rule.ELIMINATION': '+1 par qualifié, +1 à 5 par écart',
    'rule.BRACKET': '+2 affiche, +2 vainqueur, +2 score',
    'rule.LEGACY': '+2 affiche, +2 vainqueur, +2 score',

    'ranking.title': 'Votre classement',
    'ranking.cut': '{n} qualifiés',
    'ranking.progress': '{placed} placés sur {total}',
    'ranking.pool': 'À placer',
    'ranking.pool.empty': 'Tout le monde est classé.',
    'ranking.empty': 'Faites glisser un nom depuis la droite, ou touchez-le pour l’ajouter en bas.',
    'ranking.cutline': 'Ligne de qualification',
    'ranking.drop': 'Déposez ici',
    'ranking.remove': 'Retirer {name}',
    'ranking.grab': 'Déplacer {name}. Glissez, ou utilisez les flèches.',
    'ranking.add': 'Placer {name}',
    'ranking.fill': 'Remplir par seed',
    'ranking.reset': 'Tout effacer',
    'ranking.hint': 'Glissez pour réordonner. Les flèches marchent aussi.',

    'bracket.round.ROUND_OF_16': 'Huitièmes',
    'bracket.round.QUARTER': 'Quarts de finale',
    'bracket.round.SEMI': 'Demi-finales',
    'bracket.round.SMALL_FINAL': 'Petite finale',
    'bracket.round.FINAL': 'Finale',
    'bracket.round.LEGACY': 'Legacy',
    'bracket.tbd': 'à déterminer',
    'bracket.winner': 'Vainqueur',
    'bracket.score': 'Score',
    'bracket.score.none': 'Sans avis',
    'bracket.clear': 'Effacer',

    'leaderboard.eyebrow': 'Qui lit le mieux les battles',
    'leaderboard.title': 'Classement',
    'leaderboard.scope': 'Périmètre',
    'leaderboard.scope.all': 'Tous les événements',
    'leaderboard.empty': 'Aucun pronostic scoré sur ce périmètre pour le moment.',
    'leaderboard.col.player': 'Pronostiqueur',
    'leaderboard.col.predictions': 'Pronostics',
    'leaderboard.col.points': 'Points',
    'leaderboard.deleted': 'Compte supprimé',
    'leaderboard.tostats': 'Voir les statistiques détaillées',

    'artists.eyebrow': 'Réutilisables d’un événement à l’autre',
    'artists.title': 'Artistes',
    'artists.search': 'Chercher un nom',
    'artists.empty': 'Aucun artiste ne correspond.',
    'artists.unknown': 'Origine inconnue',
    'artists.record': 'Bilan en battle',
    'artists.podiums': 'Podiums',
    'artists.pickedToWin': 'Fois donné vainqueur',
    'artists.accuracy': 'Réussite de ceux qui l’ont pris',
    'artists.appearances': 'Participations',
    'artists.appearances.empty': 'Pas encore engagé sur un événement enregistré.',
    'artists.col.event': 'Événement',
    'artists.col.category': 'Catégorie',
    'artists.col.as': 'Sous le nom de',

    'profile.signin': 'Connectez-vous pour retrouver vos pronostics.',
    'profile.member': 'Inscrit depuis {date}',
    'profile.points': 'Points cumulés',
    'profile.scored': 'Pronostics scorés',
    'profile.pending': 'En attente de résultat',
    'profile.drafts': 'Brouillons',
    'profile.bucket.live': 'En cours',
    'profile.bucket.done': 'Terminés',
    'profile.bucket.drafts': 'Brouillons',
    'profile.bucket.empty': 'Rien ici pour l’instant.',

    'stats.eyebrow': 'Chaque pronostic déposé, compté',
    'stats.title': 'Statistiques des joueurs',
    'stats.players': 'Joueurs',
    'stats.predictions': 'Pronostics déposés',
    'stats.pointsGiven': 'Points distribués',
    'stats.battlesRead': 'Battles bien lues',
    'stats.table.title': 'Joueur par joueur',
    'stats.col.player': 'Joueur',
    'stats.col.predictions': 'Pronos',
    'stats.col.points': 'Points',
    'stats.col.average': 'Moy. / prono',
    'stats.col.accuracy': 'Réussite en battle',
    'stats.empty': 'Rien à compter pour l’instant — les stats arrivent dès les premiers résultats publiés.',
    'stats.favourites': 'Les favoris du public',
    'stats.favourites.lede': 'Donnés vainqueurs de la finale, tous pronostics confondus.',
    'stats.favourites.count': '{n} fois',
    'stats.profile': 'Ouvrir le profil',
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* pas de mémorisation en navigation privée, tant pis */
    }
  }, []);

  const value = useMemo(() => {
    const locale = LANGS.find((l) => l.id === lang)?.locale ?? 'en-GB';

    /** t('home.counter') · t('home.cta.predict', { event: 'GBB 2026' }) */
    const t = (key, vars) => {
      const raw = DICT[lang]?.[key] ?? DICT.en[key];
      if (raw == null) {
        if (import.meta.env.DEV) console.warn(`[i18n] clé manquante : ${key}`);
        return key;
      }
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
    };

    const date = (value, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
      value ? new Date(value).toLocaleDateString(locale, opts) : '';

    const number = (value) => new Intl.NumberFormat(locale).format(value ?? 0);

    return { lang, setLang, t, date, number, locale };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être appelé sous <I18nProvider>');
  return ctx;
}