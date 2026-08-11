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
    'nav.mine': 'My picks',
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
    'home.title.l1': 'Call the battles',
    'home.title.l2a': 'before ',
    'home.title.em': 'they happen',
    'home.title.l2b': '.',
    'home.lede':
      'Rank the wildcards, draw the bracket, name the winners. Then watch it play out and find out who actually read it right. Bring your friends — the arguing afterwards is half the point.',
    'home.cta.predict': 'Make your picks — {event}',
    'home.cta.browse': 'See the categories',
    'home.counter': 'picks in so far',
    'home.open': 'Open now',
    'home.open.none': 'Nothing open right now',
    'home.open.none.lede': 'No event is taking predictions at the moment. The next one shows up here.',
    'home.events': 'Everything else',
    'home.events.count': '{n} on the calendar',
    'home.events.empty': 'Nothing published yet. Come back when the next competition is announced.',
    'home.draft.hint': 'Staff only — not public',
    'home.auth.failed': 'Discord sign-in did not go through. Start it again from the button at the top right.',
    'home.venue.tbc': 'Venue to be confirmed',
    'home.predictions.short': 'preds',

    'status.DRAFT': 'Draft',
    'status.OPEN': 'Predictions open',
    'status.LIVE': 'Live',
    'status.FINISHED': 'Finished',

    'event.signin':
      'Sign in with Discord to file a prediction. You can browse and prepare your picks right away — they will be lost on reload.',
    'event.save.draft': 'Save',
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

    'leaderboard.eyebrow': 'Points, accuracy and what the crowd got wrong',
    'leaderboard.title': 'Leaderboard',
    'leaderboard.scope': 'Scope',
    'leaderboard.scope.all': 'All events',
    'leaderboard.empty': 'No prediction scored in this scope yet.',
    'leaderboard.col.player': 'Player',
    'leaderboard.col.predictions': 'Predictions',
    'leaderboard.col.points': 'Points',
    'leaderboard.deleted': 'Deleted account',

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
    'stats.profile': 'Open profile',
    'stats.wellRead': 'Best read by the crowd',
    'stats.wellRead.lede': 'Smallest gap between the average predicted place and the real one.',
    'stats.underRated': 'Underrated',
    'stats.underRated.lede': 'Finished far higher than the crowd expected.',
    'stats.overRated': 'Overrated',
    'stats.overRated.lede': 'Everyone had them high. They did not get there.',
    'stats.col.artist': 'Artist',
    'stats.col.expected': 'Expected',
    'stats.col.actual': 'Actual',
    'stats.col.gap': 'Gap',
    'stats.col.voters': 'Voices',
    'event.deadline': 'Predictions close {date}',
    'event.deadline.none': 'No closing date yet — phases lock as they start',
    'event.deadline.passed': 'Predictions are closed',
    'event.judges': '{n} judges',
    'event.saving': 'Saving…',
    'draft.copy.title': 'Name this draft',
    'draft.copy.label': 'Draft name',
    'draft.copy.hint': 'A copy of what is on screen right now. You stay on your current version — the copy waits in your drafts.',
    'draft.copy.confirm': 'Create the draft',
    'draft.copy.of': 'Copy of {name}',
    'draft.cancel': 'Cancel',
    'draft.isdraft': 'Draft',
    'draft.pending': 'Nothing saved yet',
    'event.save.filed': 'Update my filed prediction',
    'event.saved.into': 'Saved into “{name}” — find it in your drafts.',
    'event.saved.filed': 'Filed prediction updated.',
    'help.open': 'How do points work?',
    'help.eyebrow': 'Scoring',
    'help.title': 'How points work',
    'help.intro': 'You score for reading the competition right — not for guessing a single result. Every phase pays on its own.',
    'help.col.what': 'What pays',
    'help.col.when': 'When',
    'help.col.points': 'Points',
    'help.rank.qualified': 'A qualifier called right',
    'help.rank.qualified.detail': 'Wildcards and eliminations, per artist you placed in the qualifying spots',
    'help.rank.gap': 'A place called close',
    'help.rank.gap.detail': 'The nearer your placing to the real one, the more it pays',
    'help.battle.matchup': 'The matchup happened',
    'help.battle.matchup.detail': 'The two artists you paired did face each other',
    'help.battle.winner': 'The right winner',
    'help.battle.winner.detail': 'On a matchup that actually took place',
    'help.battle.score': 'The right score',
    'help.battle.score.detail': 'The exact judge split',
    'help.matchup.title': 'A matchup pays wherever it happens',
    'help.matchup.body': 'This is the rule people miss. If you put Alem against NaPoM in the semi-final and they meet in the quarter-final instead, you still score: the matchup is compared on the pair of artists, not on where it sits in the bracket. Reading who crosses paths is worth as much as reading the round.',
    'help.gap.title': 'The placing gap',
    'help.gap.body': 'On a ranking, an exact placing pays 5. One place off pays 4, and so on down to nothing beyond four places.',
    'help.gap.col.gap': 'Places off',
    'help.gap.col.points': 'Points',
    'help.drafts.title': 'Drafts and the filed prediction',
    'help.drafts.body': 'Keep up to ten versions per category to try things out. Only the one you file counts for points — the others stay private, and filing another sends the previous one back to drafts without losing it.',
    'help.close': 'Got it',
    'draft.load': 'Version',
    'draft.manage': 'Manage your drafts from your profile.',
    'draft.snapshot': 'Duplicate as a draft',
    'draft.saved': 'Copy saved as {name}. Manage it from your profile.',
    'draft.submitted': 'Filed',
    'draft.close': 'Close',
    'draft.empty': 'Nothing was filled in on this category.',
    'draft.delete': 'Delete',
    'draft.untitled': 'Untitled',
    'draft.delete': 'Delete',
    'draft.submitted': 'filed prediction',
    'draft.untitled': 'Untitled',
  },

  fr: {
    'brand.name': 'beatboxpredictions',
    'brand.mark': '3-0',

    'nav.events': 'Événements',
    'nav.leaderboard': 'Classement',
    'nav.artists': 'Artistes',
    'nav.stats': 'Stats',
    'nav.mine': 'Mes pronos',
    'nav.admin': 'Admin',
    'nav.logout': 'Déconnexion',
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
    'home.title.l1': 'Annoncez les battles',
    'home.title.l2a': 'avant ',
    'home.title.em': 'qu’elles arrivent',
    'home.title.l2b': '.',
    'home.lede':
      'Classez les wildcards, dessinez l’arbre, désignez les vainqueurs. Puis regardez la compète et voyez qui avait vu juste. Ramenez vos potes : s’engueuler après, c’est la moitié du plaisir.',
    'home.cta.predict': 'Faire mes pronos — {event}',
    'home.cta.browse': 'Voir les catégories',
    'home.counter': 'pronos déposés',
    'home.open': 'Ouvert maintenant',
    'home.open.none': 'Rien d’ouvert pour l’instant',
    'home.open.none.lede': 'Aucun événement ne prend de pronostics en ce moment. Le prochain apparaîtra ici.',
    'home.events': 'Le reste',
    'home.events.count': '{n} au calendrier',
    'home.events.empty': 'Rien de publié pour l’instant. Repassez à l’annonce de la prochaine compète.',
    'home.draft.hint': 'Staff seulement — invisible au public',
    'home.auth.failed': 'La connexion Discord n’a pas abouti. Relancez-la depuis le bouton en haut à droite.',
    'home.venue.tbc': 'Lieu à confirmer',
    'home.predictions.short': 'pronos',

    'status.DRAFT': 'Brouillon',
    'status.OPEN': 'Pronostics ouverts',
    'status.LIVE': 'En cours',
    'status.FINISHED': 'Terminé',

    'event.signin':
      'Connectez-vous avec Discord pour enregistrer un pronostic. Vous pouvez déjà tout parcourir et préparer vos choix, ils seront perdus au rechargement.',
    'event.save.draft': 'Enregistrer',
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

    'leaderboard.eyebrow': 'Points, réussite, et ce que la foule a mal lu',
    'leaderboard.title': 'Classement',
    'leaderboard.scope': 'Périmètre',
    'leaderboard.scope.all': 'Tous les événements',
    'leaderboard.empty': 'Aucun pronostic scoré sur ce périmètre pour le moment.',
    'leaderboard.col.player': 'Pronostiqueur',
    'leaderboard.col.predictions': 'Pronostics',
    'leaderboard.col.points': 'Points',
    'leaderboard.deleted': 'Compte supprimé',

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
    'stats.profile': 'Ouvrir le profil',
    'stats.wellRead': 'Les mieux lus',
    'stats.wellRead.lede': 'Le plus faible écart entre la place moyenne pronostiquée et la place réelle.',
    'stats.underRated': 'Sous-cotés',
    'stats.underRated.lede': 'Ils ont fini bien plus haut que ce que la foule attendait.',
    'stats.overRated': 'Surcotés',
    'stats.overRated.lede': 'Tout le monde les voyait haut. Ils n’y sont pas arrivés.',
    'stats.col.artist': 'Artiste',
    'stats.col.expected': 'Attendu',
    'stats.col.actual': 'Réel',
    'stats.col.gap': 'Écart',
    'stats.col.voters': 'Avis',
    'event.deadline': 'Pronostics fermés {date}',
    'event.deadline.none': 'Pas encore de date de fermeture — chaque phase se verrouille à son coup d’envoi',
    'event.deadline.passed': 'Les pronostics sont fermés',
    'event.judges': '{n} juges',
    'event.saving': 'Enregistrement…',
    'draft.copy.title': 'Nommer ce brouillon',
    'draft.copy.label': 'Nom du brouillon',
    'draft.copy.hint': 'Une copie de ce qui est à l’écran en ce moment. Vous restez sur votre version courante — la copie attend dans vos brouillons.',
    'draft.copy.confirm': 'Créer le brouillon',
    'draft.copy.of': 'Copie de {name}',
    'draft.cancel': 'Annuler',
    'draft.isdraft': 'Brouillon',
    'draft.pending': 'Rien d’enregistré pour l’instant',
    'event.save.filed': 'Mettre à jour le pronostic déposé',
    'event.saved.into': 'Enregistré dans « {name} » — vous le retrouverez dans vos brouillons.',
    'event.saved.filed': 'Pronostic déposé mis à jour.',
    'help.open': 'Comment marchent les points ?',
    'help.eyebrow': 'Barème',
    'help.title': 'Comment marchent les points',
    'help.intro': 'On marque pour avoir bien lu la compétition — pas pour avoir deviné un résultat isolé. Chaque phase rapporte de son côté.',
    'help.col.what': 'Ce qui rapporte',
    'help.col.when': 'Quand',
    'help.col.points': 'Points',
    'help.rank.qualified': 'Un qualifié bien vu',
    'help.rank.qualified.detail': 'Wildcards et éliminations, par artiste placé dans les places qualificatives',
    'help.rank.gap': 'Une place bien visée',
    'help.rank.gap.detail': 'Plus votre place est proche de la vraie, plus elle rapporte',
    'help.battle.matchup': 'L’affiche a eu lieu',
    'help.battle.matchup.detail': 'Les deux artistes que vous avez opposés se sont bien affrontés',
    'help.battle.winner': 'Le bon vainqueur',
    'help.battle.winner.detail': 'Sur une affiche qui s’est réellement jouée',
    'help.battle.score': 'Le bon score',
    'help.battle.score.detail': 'La répartition exacte des voix des juges',
    'help.matchup.title': 'Une affiche rapporte où qu’elle se joue',
    'help.matchup.body': 'C’est la règle qu’on rate au premier regard. Si vous opposez Alem à NaPoM en demi-finale et qu’ils se croisent en quart, vous marquez quand même : l’affiche est comparée sur la paire d’artistes, pas sur son emplacement dans le tableau. Lire qui va se croiser vaut autant que lire à quel tour.',
    'help.gap.title': 'L’écart de placement',
    'help.gap.body': 'Sur un classement, une place exacte rapporte 5. Une place d’écart en rapporte 4, et ainsi de suite jusqu’à plus rien au-delà de quatre places.',
    'help.gap.col.gap': 'Places d’écart',
    'help.gap.col.points': 'Points',
    'help.drafts.title': 'Brouillons et pronostic déposé',
    'help.drafts.body': 'Gardez jusqu’à dix versions par catégorie pour tester des idées. Seule celle que vous déposez compte pour les points — les autres restent privées, et en déposer une autre renvoie la précédente en brouillon sans rien perdre.',
    'help.close': 'Compris',
    'draft.load': 'Version',
    'draft.manage': 'Gérez vos brouillons depuis votre profil.',
    'draft.snapshot': 'Dupliquer en brouillon',
    'draft.saved': 'Copie enregistrée sous {name}. Retrouvez-la sur votre profil.',
    'draft.submitted': 'Déposé',
    'draft.close': 'Fermer',
    'draft.empty': 'Rien n’a été rempli sur cette catégorie.',
    'draft.delete': 'Supprimer',
    'draft.untitled': 'Sans titre',
    'draft.delete': 'Supprimer',
    'draft.submitted': 'pronostic déposé',
    'draft.untitled': 'Sans titre',
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