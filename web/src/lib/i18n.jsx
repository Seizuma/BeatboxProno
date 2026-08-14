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
    'bracket.clearAll': 'Clear the bracket',
    'bracket.called': '{n} calls made',

    'leaderboard.eyebrow': 'Points, accuracy and what the crowd got wrong',
    'leaderboard.title': 'Leaderboard',
    'leaderboard.scope': 'Scope',
    'leaderboard.scope.all': 'All events',
    'leaderboard.kind': 'Category',
    'leaderboard.kind.all': 'All categories',
    'kind.SOLO': 'Solo',
    'kind.TAG_TEAM': 'Tag Team',
    'kind.LOOPSTATION': 'Loopstation',
    'kind.CREW': 'Crew',
    'kind.LEGACY': 'Legacy',
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
    'event.closed.live':
      'The event is underway — predictions are closed. You can still browse your picks, but no longer edit them.',
    'event.judges': '{n} judges',
    'event.saving': 'Saving…',
    'leave.title': 'You have unsaved changes',
    'leave.body': 'These categories were modified but not saved:',
    'leave.never': 'never saved',
    'leave.hint': 'Saving keeps everything as a draft. Nothing is filed — file it yourself when you are ready.',
    'leave.save': 'Save and leave',
    'leave.discard': 'Leave without saving',
    'leave.stay': 'Stay on the page',
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
    'help.card.rank': 'Reading a place right',
    'help.card.rank.hint': 'On a ranking, the closer your placing, the more it pays.',
    'help.card.qualify': 'Per artist who goes through',
    'help.card.qualify.hint': 'Only those who really qualify, and only if you had them in the qualifying spots.',
    'help.card.battle': 'A battle read perfectly',
    'help.card.battle.hint': '2 the battle happened, 2 the winner, 2 the score.',
    'help.gap.title': 'The placing gap',
    'help.gap.exact': 'Exact',
    'help.gap.beyond': 'Beyond',
    'help.matchup.short': 'Put Alem against NaPoM in the semi-final and they meet in the quarter-final instead? You still score. A battle is judged on the pair, not on where it sits in the bracket.',
    'help.title': 'How points work',
    'help.matchup.title': 'A battle pays wherever it happens',
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

    /* --- Boîte à idées ---------------------------------------------------- */
    'postbox.open': 'Contact us',
    'postbox.eyebrow': 'Postbox',
    'postbox.title': 'Tell us something',
    'postbox.lede': 'Goes straight to the Discord. Include as much detail as you can.',
    'postbox.kind': 'What is it about?',
    'postbox.kind.suggestion': 'Event suggestion',
    'postbox.kind.suggestion.hint': 'A competition we should cover',
    'postbox.kind.bug': 'Bug report',
    'postbox.kind.bug.hint': 'Something is broken',
    'postbox.body': 'Your message',
    'postbox.body.ph.suggestion': 'Which competition, when, where, and where to follow it…',
    'postbox.body.ph.bug': 'What you did, what you expected, what happened instead…',
    'postbox.tooshort': 'at least {n} characters',
    'postbox.send': 'Send',
    'postbox.sending': 'Sending…',
    'postbox.cancel': 'Cancel',
    'postbox.close': 'Close',
    'postbox.quota': '{n} of {max} left this month',
    'postbox.exhausted':
      'You have used all your messages for this month. The counter resets on the 1st.',
    'postbox.sent.title': 'Message sent',
    'postbox.sent.body': 'It landed on the Discord. Thanks — we read everything.',
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
    'rule.BRACKET': '+2 battle, +2 vainqueur, +2 score',
    'rule.LEGACY': '+2 battle, +2 vainqueur, +2 score',

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
    'bracket.clearAll': 'Tout effacer',
    'bracket.called': '{n} affiches tranchées',

    'leaderboard.eyebrow': 'Points, réussite, et ce que la foule a mal lu',
    'leaderboard.title': 'Classement',
    'leaderboard.scope': 'Périmètre',
    'leaderboard.scope.all': 'Tous les événements',
    'leaderboard.kind': 'Catégorie',
    'leaderboard.kind.all': 'Toutes catégories',
    'kind.SOLO': 'Solo',
    'kind.TAG_TEAM': 'Tag Team',
    'kind.LOOPSTATION': 'Loopstation',
    'kind.CREW': 'Crew',
    'kind.LEGACY': 'Legacy',
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
    'event.closed.live':
      'L’événement est en cours — les pronostics sont fermés. Vous pouvez encore consulter vos pronos, mais plus les modifier.',
    'event.judges': '{n} juges',
    'event.saving': 'Enregistrement…',
    'leave.title': 'Des modifications ne sont pas enregistrées',
    'leave.body': 'Ces catégories ont été modifiées sans être enregistrées :',
    'leave.never': 'jamais enregistrée',
    'leave.hint': 'Enregistrer conserve tout en brouillon. Rien n’est déposé — déposez vous-même quand vous serez prêt.',
    'leave.save': 'Enregistrer et quitter',
    'leave.discard': 'Quitter sans enregistrer',
    'leave.stay': 'Rester sur la page',
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
    'help.card.rank': 'Une place bien visée',
    'help.card.rank.hint': 'Sur un classement, plus votre place est proche, plus elle rapporte.',
    'help.card.qualify': 'Par artiste qui passe',
    'help.card.qualify.hint': 'Uniquement ceux qui se qualifient vraiment, et si vous les aviez dans les places qualificatives.',
    'help.card.battle': 'Une battle parfaitement lue',
    'help.card.battle.hint': '2 le battle a eu lieu, 2 le vainqueur, 2 le score.',
    'help.gap.title': 'L’écart de placement',
    'help.gap.exact': 'Exact',
    'help.gap.beyond': 'Au-delà',
    'help.matchup.short': 'Vous opposez Alem à NaPoM en demi-finale et ils se croisent en quart ? Vous marquez quand même. Un battle se juge sur la paire, pas sur sa place dans le tableau.',
    'help.title': 'Comment marchent les points',
    'help.matchup.title': 'Un battle rapporte où qu’il se joue',
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

    /* --- Boîte à idées ---------------------------------------------------- */
    'postbox.open': 'Nous écrire',
    'postbox.eyebrow': 'Boîte à idées',
    'postbox.title': 'Dites-nous quelque chose',
    'postbox.lede': 'Ça part directement sur le Discord. Soyez aussi précis que possible.',
    'postbox.kind': 'De quoi s’agit-il ?',
    'postbox.kind.suggestion': 'Suggestion d’événement',
    'postbox.kind.suggestion.hint': 'Une compète à couvrir',
    'postbox.kind.bug': 'Rapport de bug',
    'postbox.kind.bug.hint': 'Quelque chose ne marche pas',
    'postbox.body': 'Votre message',
    'postbox.body.ph.suggestion': 'Quelle compète, quand, où, et où la suivre…',
    'postbox.body.ph.bug': 'Ce que vous avez fait, ce que vous attendiez, ce qui s’est passé…',
    'postbox.tooshort': 'au moins {n} caractères',
    'postbox.send': 'Envoyer',
    'postbox.sending': 'Envoi…',
    'postbox.cancel': 'Annuler',
    'postbox.close': 'Fermer',
    'postbox.quota': '{n} sur {max} restants ce mois-ci',
    'postbox.exhausted':
      'Vous avez utilisé vos messages du mois. Le compteur repart le 1er.',
    'postbox.sent.title': 'Message envoyé',
    'postbox.sent.body': 'Il est arrivé sur le Discord. Merci — on lit tout.',
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