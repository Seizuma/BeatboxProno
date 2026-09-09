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
    'nav.groups': 'Groups',
    'nav.artists': 'Artists',
    'nav.stats': 'Stats',
    'nav.mine': 'My picks',
    'nav.admin': 'Admin',
    'nav.logout': 'Sign out',
    'nav.language': 'Language',
    'nav.menu': 'Menu',
    'nav.shop': 'Shop',

    'footer.tagline': 'Predictions close when each phase kicks off.',

    'common.loading': 'Loading…',
    'common.open': 'Open',
    'common.none': 'None',
    'common.points': 'points',
    'common.seed': 'Seed',
    'common.search': 'Search',
    'common.clear': 'Clear',
    'common.back': 'Back to events',
    // La connexion Discord. Le libellé était écrit en dur dans le bouton, en
    // français : l'anglais du site affichait « Se connecter avec Discord ».
    'auth.discord': 'Sign in with Discord',
    // Les pannes réseau. Elles sont levées hors de React, dans `api.js`, qui
    // passe donc par `translator(detectLang())` plutôt que par le contexte.
    'api.offline': 'The server is unreachable. Check your connection.',
    'api.down': 'The server is not responding. Try again in a moment.',
    'api.unexpected': 'Unexpected response from the server.',
    'api.failed': 'The request did not go through.',

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
    'home.auth.banned': 'This account is closed. If you think this is a mistake, get in touch through the postbox.',
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
    'event.excluded':
      'You are not allowed to predict on this event. You can still browse everything. If you think this is a mistake, get in touch through the postbox.',

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
    'ranking.discard': 'Drop {name} from your list',
    'ranking.grab': 'Move {name}. Drag, or use the arrow keys.',
    'ranking.add': 'Place {name}',
    'ranking.fill': 'Fill by seed',
    'ranking.reset': 'Clear all',
    'ranking.hint': 'Drag to reorder. Arrow keys work too.',

    'bracket.round.ROUND_OF_32': 'Round of 32',
    'bracket.round.ROUND_OF_16': 'Round of 16',
    'bracket.round.QUARTER': 'Quarter-finals',
    'bracket.round.SEMI': 'Semi-finals',
    'bracket.round.SMALL_FINAL': 'Small final',
    'bracket.round.FINAL': 'Final',
    'bracket.round.LEGACY': 'Legacy',

    'result.title': 'Official result',
    'result.open': 'See the result',
    'result.empty': 'Result not published yet.',
    'result.col.rank': 'Place',
    'result.col.artist': 'Artist',
    'result.col.mine': 'Your call',
    'result.col.gap': 'Gap',
    'result.col.battle': 'Matchup',
    'result.col.official': 'What happened',
    'result.col.yours': 'What you called',
    'result.qualified': 'Through',
    'result.notRanked': 'unranked',
    'result.noPick': 'No call',
    'result.hits': '{n}/{total} qualifiers called',
    'result.winners': '{n}/{total} winners called',
    'result.ghosts': 'You also called, and they are not in the result:',
    'result.hit.matchup': 'Matchup',
    'result.hit.winner': 'Winner',
    'result.hit.score': 'Score',

    'bracket.tbd': 'to be decided',
    'bracket.winner': 'Winner',
    'bracket.score': 'Score',
    'bracket.score.none': 'No call',
    'bracket.clear': 'Clear',
    'bracket.clearAll': 'Clear the bracket',
    'bracket.called': '{n} calls made',

    'groups.eyebrow': 'Your private circles',
    'groups.title': 'Groups',
    'groups.lede':
      'A leaderboard between friends, on the competitions you choose, and comments pinned anywhere on each other’s picks. Nothing here is public — a group is entered through a link, never found by searching.',
    'groups.empty':
      'You are not in a group yet. Create one, or open an invite link somebody sent you.',
    'groups.create': 'Create a group',
    'groups.create.name': 'Name',
    'groups.create.name.hint': 'The crew, office league, Discord server…',
    'groups.create.description': 'Description',
    'groups.create.description.hint': 'Optional. Shown on the invite page.',
    'groups.create.submit': 'Create',
    'groups.full':
      'You are in {max} groups already — the cap counts the ones you own and the ones you joined. Leave one to create another.',
    'groups.count': '{n} of {max} groups',
    'groups.members': '{n} members',
    'groups.events': '{n} competitions',
    'groups.events.none': 'No competition yet',
    'groups.role.OWNER': 'Owner',
    'groups.role.MEMBER': 'Member',

    'group.ladder': 'Standings',
    'group.ladder.empty': 'Nothing scored yet.',
    'group.ladder.picks': '{n} picks',
    'group.ladder.none': 'no pick',
    'group.picks': 'Filed picks',
    'group.picks.empty': 'No filed prediction here yet.',
    'group.picks.of': 'Picks by {name}',
    'group.picks.all': 'Everyone',
    'group.picks.comments': '{n}',
    'group.picks.pending': 'awaiting result',
    'group.members.title': 'Members',
    'group.joined': 'Joined {date}',
    'group.scope': 'Competitions',
    'group.scope.lede':
      'The group only counts these competitions: the standings, the picks shown and what can be commented all follow this list.',
    'group.scope.empty': 'This group follows no competition yet, so there is nothing to rank.',
    'group.scope.empty.owner': 'Pick the competitions this group plays on — nothing is counted until you do.',
    'group.scope.edit': 'Choose competitions',
    'group.scope.save': 'Save',
    'group.scope.saved': 'Scope updated.',
    'group.scope.keep':
      'Removing a competition hides its picks and their comments. Nothing is deleted — put it back and everything returns.',
    'group.invite': 'Invite link',
    'group.invite.short': 'Invite',
    'group.invite.lede': 'Anyone with a beatboxpredictions account can join through this link.',
    'group.invite.copy': 'Copy',
    'group.invite.copied': 'Link copied.',
    'group.invite.rotate': 'New link',
    'group.invite.rotate.confirm':
      'The current link stops working immediately. Anyone still holding it will need the new one. Continue?',
    'group.invite.closed': 'Joining is closed. The link no longer opens.',
    'group.invite.close': 'Close joining',
    'group.invite.reopen': 'Reopen joining',
    'group.rename': 'Rename group',
    'group.rename.label': 'Name',
    'group.transfer': 'Hand over ownership',
    'group.transfer.lede':
      'The member you choose takes over: they set the scope, invite, remove and dissolve. You stay in the group as a member. The change is immediate and you cannot undo it yourself.',
    'group.transfer.confirm': 'Hand the group over to {name}?',
    'group.kick': 'Remove from group',
    'group.kick.confirm': 'Remove {name}? Their comments stay — others replied to them.',
    'group.leave': 'Leave group',
    'group.leave.confirm': 'Leave this group? You will need a new invite to come back.',
    'group.dissolve': 'Dissolve group',
    'group.dissolve.confirm':
      'Dissolve this group for everyone? The standings and every comment are lost. Predictions are not — they belong to their authors.',
    'group.gone': 'Group dissolved.',
    'group.left': 'You left the group.',

    'groups.join.title': 'Join a group',
    'groups.join.lede':
      'Somebody sent you an invite? Paste the link or the code here. Groups are never listed publicly — this is the only way in.',
    'groups.join.field': 'Invite link or code',
    'groups.join.submit': 'Continue',
    'groups.join.invalid': 'That does not look like an invite link or code.',

    'join.what': 'What joining means',
    'join.what.standings': 'Your points appear in this group’s standings, alongside its members.',
    'join.what.picks': 'Members can read the predictions you have filed, and pin comments on them.',
    'join.what.private': 'Nothing becomes public: this stays between the members of this group.',
    'join.what.leave': 'You can leave at any time, from the group page.',

    'notif.title': 'Notifications',
    'notif.empty': 'Nothing new.',
    'notif.markAll': 'Mark all read',
    'notif.GROUP_JOIN': '{name} joined {group}',
    'notif.COMMENT_ON_MINE': '{name} commented on your prediction in {group}',
    'notif.COMMENT_REPLY': '{name} wrote in a thread you took part in, in {group}',
    'notif.EVENT_OPEN': 'Predictions are open for {event}',
    'notif.someone': 'A former member',

    'announce.title': 'Opening poster',
    'announce.lang': 'Poster language',
    'announce.banner': 'PREDICTIONS OPEN',
    'announce.categories': 'CATEGORIES',
    'announce.entrants': '{n} participants',
    'announce.deadline': 'PREDICTIONS CLOSE',
    'announce.hint':
      'A story to publish when predictions open: the competition, its dates, the categories and how many are entered, and the deadline. Everything else is one tap away on the site.',

    'news.title': 'What’s new',
    'news.close': 'Got it',
    'news.new': 'new',
    'news.unread': '{n} update(s) you have not read',
    'news.reread': 'Read again any time',
    'news.lede':
      'Everything that changed for you, newest first. This page stays here — come back whenever you like.',
    'news.r0.title': 'Private groups, image export and a reworked leaderboard',
    'news.r0.groups':
      'Private groups: create a circle, share its invite link, and get a leaderboard just between you.',
    'news.r0.comments':
      'Pin comments anywhere on someone’s prediction: on a ranking row, on a bracket matchup, or on a whole phase.',
    'news.r0.bell':
      'A bell in the header tells you when somebody joins your group, comments on your prediction, or when a competition opens.',
    'news.r0.export':
      'Export a prediction as an image — square post, story or wide — with the full bracket and the scores.',
    'news.r0.precision':
      'The leaderboard replaces battle accuracy with Precision: the points you scored over the points that were up for grabs. Expect lower numbers — the old measure rewarded predicting badly.',
    'news.r0.search':
      'Search the leaderboard by name, and click any player to open their profile.',
    'news.r0.artists':
      'Artist pages now break their stats down competition by competition, with a chart of where the crowd places them.',
    'news.r0.jury': 'A competition category can now show its panel of judges.',
    'news.r0.mobile':
      'A full pass on phones: no more sideways scrolling, dialogs that reach the bottom of the screen, bigger touch targets.',
    'news.r0.logout': 'Signing out has moved to your profile page.',

    'export.open': 'Export',
    'export.title': 'Export this prediction',
    'export.format.square': 'Square post',
    'export.format.story': 'Story',
    'export.format.wide': 'Wide',
    'export.download': 'Download',
    'export.share': 'Share…',
    'export.share.unsupported': 'Your browser cannot share files. Download the image instead.',
    'export.hint':
      'The card carries the whole prediction: every ranking phase and every bracket round, with the picked winners and scores.',
    'export.stamp.hint': 'Click on the card to drop your stamp.',
    'export.stamp.none': 'Wear a stamp from the shop to mark this card.',

    'join.eyebrow': 'Invitation',
    'join.title': 'Join {name}',
    'join.members': '{n} people are already in.',
    'join.scope': 'Plays on: {events}',
    'join.signin':
      'Sign in with Discord to join. Nothing is ever posted on your behalf — only your name and avatar are read.',
    'join.accept': 'Join the group',
    'join.already': 'You are already a member of this group.',
    'join.open': 'Open the group',
    'join.closed': 'Joining this group is closed. Ask a member for a fresh link.',
    'join.full': 'This group is full.',
    'join.limit': 'You are in {max} groups already. Leave one to join this one.',
    'join.invalid': 'This invite link is not valid. It may have been renewed since it was shared.',

    'pin.mode': 'Pin a comment',
    'pin.mode.on': 'Click the spot to pin',
    'pin.mode.hint': 'Click a rank, a battle or a phase to hang your comment on it.',
    'pin.cancel': 'Cancel',
    'pin.orphan': 'Pinned to a part of the prediction that is no longer shown.',
    'thread.title': 'Comments',
    'thread.lede': 'Visible only to members of {group}.',
    'thread.empty': 'No comment yet. Say what you make of these picks.',
    'thread.placeholder': 'What do you make of it?',
    'thread.send': 'Post',
    'thread.edit': 'Edit',
    'thread.edited': 'edited',
    'thread.delete': 'Delete',
    'thread.delete.confirm': 'Delete this comment?',
    'thread.save': 'Save',
    'thread.cancel': 'Cancel',
    'thread.close': 'Close',

    'privacy.collect.groups': 'The groups you join and the comments you write in them',
    'privacy.collect.groups.why':
      'To show a group its own standings and its discussions.',
    'privacy.groups.title': 'Private groups',
    'privacy.groups.lede':
      'A group exists only for its members. Its name, its standings and its comments never appear on the public site, are not indexed, and a group you do not belong to is indistinguishable from a group that does not exist.',
    'privacy.groups.delete':
      'Deleting your account hands the groups you own to the member who joined first; a group is dissolved only if nobody is left. Your comments leave with your account.',

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
    'leaderboard.search': 'Find a player',
    'leaderboard.search.hint': 'Type a name…',
    'leaderboard.search.none': 'No player matches “{q}” in this scope.',
    'leaderboard.clickable':
      'Click a name to open that player’s profile and read the predictions they have filed.',
    'leaderboard.col.player': 'Player',
    'leaderboard.col.predictions': 'Predictions',
    'leaderboard.col.points': 'Points',
    'leaderboard.deleted': 'Deleted account',

    'artists.eyebrow': 'Reusable from one event to the next',
    'artists.title': 'Artists',
    'artists.search': 'Search a name',
    'artists.empty': 'No artist matches.',
    'artists.unknown': 'Origin unknown',
    'artists.pointsFrom': 'Points scored thanks to them',
    'artists.qualifiedShare': 'Seen through the cut by',
    'artists.qualifiedShareCut': 'Seen in the top {n} by',
    'artists.averageRank': 'Average rank given',
    'artists.spread': 'Where the crowd places them',
    // Le libellé du graphique pour les lecteurs d'écran. Il était en dur, en
    // français, dans un fichier par ailleurs entièrement traduit.
    'artists.spread.aria': 'Distribution of the places given',
    'artists.voters': '{n} filed predictions',
    'artists.bestWorst': 'Best {best} · worst {worst}',
    'artists.byRound': 'Picked to win, by round',
    'artists.noData': 'No filed prediction on this competition yet.',
    'artists.podiums': 'Podiums',
    'artists.pickedToWin': 'Picked to win a battle',
    'artists.accuracy': 'Hit rate of those who picked them',
    'artists.appearances': 'Appearances',
    'artists.appearances.empty': 'Not entered in a recorded event yet.',
    'artists.col.event': 'Event',
    'artists.col.category': 'Category',
    'artists.col.as': 'Entered as',

    'profile.signin': 'Sign in to find your predictions.',
    'profile.member': 'Member since {date}',
    'profile.someoneElse': 'You are looking at {name}’s profile.',
    'profile.backToMine': 'Back to mine',
    'profile.points': 'Points earned',
    'profile.submitted': 'Predictions filed',
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
    'stats.col.precision': 'Precision',
    'stats.precision': 'Average precision',
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
    'stats.results.open': 'Result statistics',
    'stats.tab.boards': 'Standouts',
    'stats.tooSmall': 'Fewer than {n} measured contenders here — the full list already says it all.',
    'stats.tab.all': 'Every contender',
    'stats.results.title': 'Result statistics',
    'stats.results.subtitle': 'How the crowd read this event',
    'stats.results.sampled': '{n} contenders measured',
    'stats.all': 'Every contender',
    'stats.all.lede':
      'Real place, average predicted place, and the gap between the two — for every contender of a published phase.',
    'event.deadline': 'Predictions close {date}',
    'event.deadline.none': 'No closing date yet — phases lock as they start',
    'event.deadline.passed': 'Predictions are closed',
    'event.closed.live':
      'The event is underway — predictions are closed. You can still browse your picks, but no longer edit them.',
    'event.judges': '{n} judges',
    'event.jury': 'Judges:',
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
    'help.card.four': 'Final top 4',
    'help.card.four.hint': 'Once per bracket, on the finish rather than the road.',
    'help.four.title': 'The final four',
    'help.four.first': 'winner',
    'help.four.second': 'runner-up',
    'help.four.third': '3rd',
    'help.four.fourth': '4th',
    'help.four.short':
      'Read from your final and small final. A bracket derails fast: one wrong quarter-final and everything below it is lost. These points look only at who ends up where — call the winner right and it pays, whatever happened on the way. The place counts too: putting the winner as runner-up is a different call.',
    'wc.title': 'How a wildcard selection is scored',
    'wc.subtitle': '{n} qualifying places',
    'wc.lede':
      'No bracket here, no battles. One list of entrants, {n} places, and one question: who gets through? You rank everyone; the points follow.',
    'wc.card.hit': 'Called a qualifier',
    'wc.card.hit.hint': 'Per artist you put in the top {n} who actually got through.',
    'wc.card.place': 'Exact place',
    'wc.card.place.hint': 'Per artist ranked at the right position.',
    'wc.gap.title': 'Placement',
    'wc.gap.exact': 'exact',
    'wc.gap.beyond': '5 or more',
    'wc.gap.short':
      'Every artist is scored on how far your rank sits from the official one. Nothing is lost for being close.',
    'wc.hit.title': 'The qualifiers',
    'wc.hit.short':
      'Three points for each artist you placed in your top {n} who really got through — whatever position you gave them. It is worth three times the usual qualification point, because here it is not a detail beside a ranking: it is the whole question.',
    'wc.note':
      'Both add up: calling a qualifier and placing them exactly pays 8 on that artist alone.',
    'wc.board.title': 'Your top {n}',
    'wc.board.lede':
      'Nobody knows yet who sent a wildcard — that is the whole question. Pick the artists you think will get through, then order them.',
    // Le compteur du plafond de pioche, et la phrase qui remplace le champ de
    // recherche une fois la limite atteinte.
    'wc.board.cap': '{n} / {max} picks',
    'wc.board.full': 'You have reached the limit of {max} picks. Remove a name to swap in another one.',
    'wc.board.search': 'Add an artist',
    'wc.board.placeholder': 'Type a name…',
    'wc.board.none': 'No artist of this format under that name.',
    'wc.board.count': '{picked} ranked · {pool} still to place',
    'wc.board.empty': 'Nothing picked yet. Search for a name above.',
    'help.title': 'How points work',
    'help.matchup.title': 'A battle pays wherever it happens',
    'help.close': 'Got it',
    // Le sous-titre dit de QUEL type d'événement on parle : la fenêtre est
    // désormais unique, et sans cette ligne on ne saurait pas quel barème on
    // est en train de lire.
    'help.mode.wildcard': 'Wildcard selection — {n} places',
    'help.mode.bracket': 'Bracket competition',
    'help.mode.all': 'Every kind of event',
    'help.kind.wildcard': 'Wildcard selection',
    'help.kind.bracket': 'Bracket competition',
    'help.kind.wildcard.lede': 'One list of entrants, a number of places, one question: who gets through?',
    'help.kind.bracket.lede': 'A ranking to read, then a bracket to draw from the first round to the final.',
    'draft.load': 'Version',
    'draft.manage': 'Manage your drafts from your profile.',
    'draft.snapshot': 'Duplicate as a draft',
    'draft.blank': 'Blank draft',
    'draft.blank.name': 'New draft',
    'draft.blank.title': 'Start a blank draft',
    'draft.blank.hint':
      'An empty version, opened straight away. What you have now stays untouched in its own version.',
    'draft.blank.confirm': 'Create and open',
    'draft.blank.done': '{name} created. You are now editing it.',
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

    /* --- Compte et confidentialité ---------------------------------------- */
    'footer.privacy': 'Privacy policy',
    // Découpé autour du cœur : celui-ci est un élément à part, pour rester
    // annonçable aux lecteurs d'écran. Les espaces comptent.
    'footer.madeby.before': 'Made with ',
    'footer.madeby.heart': 'love',
    'footer.madeby.after': ' by ',
    // La conjonction est une clé à elle seule : les espaces autour comptent,
    // puisqu'elle sépare deux liens et non deux mots.
    'footer.madeby.and': ' and ',
    'account.zone': 'Your account',
    'account.zone.lede':
      'Take your data with you, or close your account. Both are immediate and need no justification.',
    'account.export': 'Download my data',
    'account.export.hint': 'A JSON file with everything the site holds about you.',
    'account.member': 'Member since {date}.',
    'account.delete.open': 'Delete my account',
    'account.delete.title': 'Delete your account',
    'account.delete.warning': 'This is permanent. Nothing can be recovered afterwards.',
    'account.delete.owner':
      'The owner account cannot be deleted — nobody would be able to administer the site. Hand the role over first.',
    'account.delete.type': 'Type {name} to confirm',
    'account.delete.confirm': 'Delete permanently',
    'account.delete.working': 'Deleting…',
    'account.line.predictions': 'predictions',
    'account.line.points': 'points',
    'account.line.postbox': 'messages sent',
    'account.line.visits': 'days visited',
    'account.delete.what.predictions': 'Every prediction you made, draft or filed, with its scoring detail.',
    'account.delete.what.leaderboard': 'Your points and your place on the leaderboard.',
    'account.delete.what.postbox': 'The messages you sent us — though copies already relayed to Discord stay there.',
    'account.delete.what.discord': 'Your Discord name, avatar and identifier.',
    'account.delete.what.again': 'You can sign in again afterwards, but you will start from an empty account.',

    'privacy.eyebrow': 'What the site keeps',
    'privacy.title': 'Privacy',
    'privacy.updated': 'Last updated August 2026.',
    'privacy.lede':
      'BeatboxPredictions is a small independent site. It keeps as little as it can, and only what it needs to work. This page says what, why, and how to make it disappear.',
    'privacy.collect.title': 'What is collected',
    'privacy.collect.lede': 'Nothing until you sign in with Discord. From then on:',
    'privacy.collect.discord': 'Your Discord identifier, username and avatar',
    'privacy.collect.discord.why':
      'This is your account. The identifier links you to your predictions; the name and avatar appear on the leaderboard. Nothing else is read from your Discord profile — not your email, not your servers, not your messages.',
    'privacy.collect.predictions': 'Your predictions',
    'privacy.collect.predictions.why':
      'Rankings, brackets, podiums, and the points they earn. This is the whole point of the site.',
    'privacy.collect.visits': 'The days you visited',
    'privacy.collect.visits.why':
      'One line per person per day, so the site owner can see whether anyone is using it. Not which pages, not for how long, not from where — just that you came that day.',
    'privacy.collect.postbox': 'The messages you send through the postbox',
    'privacy.collect.postbox.why':
      'Suggestions and bug reports, with your name attached so we can answer. They are relayed to a private Discord channel.',
    'privacy.collect.not':
      'No IP address is stored, no tracking cookie, no advertising, no analytics service, no profiling, and nothing is ever sold.',
    'privacy.public.title': 'What other people see',
    'privacy.public.lede':
      'Your Discord name, your avatar, your points and your filed predictions are public — a leaderboard nobody can read is not a leaderboard.',
    'privacy.public.hidden':
      'Your drafts stay yours alone until you file them. Your messages through the postbox are never public.',
    'privacy.cookies.title': 'Cookies',
    'privacy.cookies.lede':
      'One cookie holds your session so you stay signed in. It is technical, required, and readable only by the server. Your language and theme preferences stay in your browser and never reach us.',
    'privacy.cookies.none': 'There is no other cookie, and no consent banner because there is nothing to consent to.',
    'privacy.third.title': 'Who else is involved',
    'privacy.third.discord':
      'Discord, for signing in and for relaying postbox messages. Their own privacy policy applies to what happens on their side.',
    'privacy.third.host':
      'The site runs on a server rented in France. The database sits on that same server and is not shared.',
    'privacy.third.none': 'Nobody else. No advertiser, no analytics provider, no data broker.',
    'privacy.keep.title': 'How long it is kept',
    'privacy.keep.lede':
      'As long as your account exists. Delete it and everything goes with it, immediately. Visit records older than a year serve no purpose and are removed.',
    'privacy.rights.title': 'Your rights',
    'privacy.rights.lede': 'No form to fill, no email to send. Everything is a button on your profile:',
    'privacy.rights.export': 'Download everything the site holds about you, as a JSON file.',
    'privacy.rights.delete': 'Delete your account and all its data, immediately and permanently.',
    'privacy.rights.fix': 'Your name and avatar refresh from Discord each time you sign in — change them there.',
    'privacy.rights.cta': 'Go to my profile',
    'privacy.rights.signin': 'Sign in with Discord to reach these controls.',
    'privacy.contact.title': 'A question',
    'privacy.contact.lede':
      'Use the postbox on the home page, or reach the site owner on the Discord. There is one person behind this site, and they read everything.',

    'shop.eyebrow': 'SHOP',
    'shop.title': 'The shop',
    'shop.balance': 'wallet',
    'shop.balance.lede':
      'Points earned on finished competitions land here. Spending them never touches your leaderboard score — that one is carved for good.',
    'shop.signin': 'Sign in with Discord to earn and spend points.',
    'shop.buy': 'Buy',
    'shop.equip': 'Wear',
    'shop.unequip': 'Remove',
    'shop.free': 'free',
    'shop.points': 'pts',
    'shop.animated': 'animated',

    'shop.preview': 'Preview',
    'shop.preview.note': 'Shown with the rest of your kit. Nothing is bought or worn yet.',
    'shop.promo.banner': '{n} items on sale until {date}. The kit rotates every week.',
    'shop.preview.noPrediction': 'File a prediction first: the preview shows your latest one.',
    'shop.preview.noBracket': 'Your latest prediction has no bracket to stamp.',
    'shop.stamp.hint': 'Click anywhere to stamp.',
    'shop.stamp.again': 'Click again to move it.',
    'shop.live.leaderboard': 'Leaderboard row',
    'shop.live.profile': 'Profile header',
    'shop.live.bracket': 'Bracket battle',
    'shop.live.card': 'Shared card',

    'shop.section.frame': 'Avatar frames',
    'shop.section.frame.lede':
      'Five pixels wide at most, hugging the photo. Shown everywhere your avatar appears.',
    'shop.section.nameFx': 'Name effects',
    'shop.section.nameFx.lede':
      'Character attributes only — nothing to draw, and readable in a dense table.',
    'shop.section.band': 'Profile bands',
    'shop.section.band.lede':
      'Two vertical strips framing your profile page. Hidden on narrow screens.',
    'shop.section.cardSkin': 'Export card skins',
    'shop.section.cardSkin.lede':
      'The only cosmetic people without an account will ever see. The price says so.',
    'shop.section.stamp': 'Stamps',
    'shop.section.stamp.lede':
      'A mark laid across your prediction, kept on the shared image.',

    'shop.badges': 'Badges',
    'shop.badges.lede':
      'Badges cannot be bought — they drop for everyone when a competition is finished.',

    'badge.PARTICIPANT': 'Wildcard — submitted a prediction',
    'badge.BRONZE': 'Top 60% of the event',
    'badge.SILVER': 'Top 30% of the event',
    'badge.GOLD': 'Top 5% of the event',
    'badge.PODIUM_3': 'Third — third best predictor',
    'badge.PODIUM_2': 'Second — runner-up predictor',
    'badge.PODIUM_1': 'Winner — best predictor',

    'profile.badges': 'Badges',
    'profile.badges.empty':
      'No badges yet — they drop when a competition you predicted is finished.',
    'profile.wallet': 'Wallet',
    'profile.views': 'Profile views',
    'profile.gate': 'Sign in with Discord to see this profile. Counted once per member per day.',
    'artists.views': 'Page views',
    'profile.shop.cta': 'Open the shop',

    'stamp.place': 'Place my stamp',
    'stamp.move': 'Move my stamp',
    'stamp.cancel': 'Cancel',
    'stamp.remove': 'Remove stamp',
    'stamp.hint': 'Click anywhere on the bracket to drop it. Escape to cancel.',
    'group.stamp.by': 'Stamped by {name}',
    'group.stamp.none': 'Wear a stamp to leave your mark here.',
    'group.stamp.invite': 'You can stamp this prediction.',
    'group.stamp.hint': 'Click anywhere on the card to stamp it.',
    'group.stamp.remove': 'Remove my stamp',
    'group.stamp.count': '{n} stamp(s)',

    'common.close': 'Close',

    'badge.rule': 'How it drops',
    'badge.awarded': 'Awarded on {date}.',

    'badge.PARTICIPANT.name': 'The wildcard',
    'badge.BRONZE.name': 'One facet',
    'badge.SILVER.name': 'Two facets',
    'badge.GOLD.name': 'Full cube',
    'badge.PODIUM_3.name': 'Third place',
    'badge.PODIUM_2.name': 'Second place',
    'badge.PODIUM_1.name': 'Winner',

    'badge.PARTICIPANT.detail':
      'One prediction filed on the competition.',
    'badge.BRONZE.detail':
      'Top 60% of predictors.',
    'badge.SILVER.detail':
      'Top 30% of predictors.',
    'badge.GOLD.detail':
      'Top 5% of predictors.',
    'badge.PODIUM_3.detail':
      'Third best predictor.',
    'badge.PODIUM_2.detail':
      'Second best predictor of the competition.',
    'badge.PODIUM_1.detail':
      'Best predictor of the competition.',
  },

  fr: {
    'brand.name': 'beatboxpredictions',
    'brand.mark': '3-0',

    'nav.events': 'Événements',
    'nav.leaderboard': 'Classement',
    'nav.groups': 'Groupes',
    'nav.artists': 'Artistes',
    'nav.stats': 'Stats',
    'nav.mine': 'Mes pronos',
    'nav.admin': 'Admin',
    'nav.logout': 'Déconnexion',
    'nav.language': 'Langue',
    'nav.menu': 'Menu',
    'nav.shop': 'Boutique',

    'footer.tagline': 'Les pronostics ferment au coup d’envoi de chaque phase.',

    'common.loading': 'Chargement…',
    'common.open': 'Ouvrir',
    'common.none': 'Aucun',
    'common.points': 'points',
    'common.seed': 'Seed',
    'common.search': 'Chercher',
    'common.clear': 'Effacer',
    'common.back': 'Revenir aux événements',
    'auth.discord': 'Se connecter avec Discord',
    'api.offline': 'Le serveur est injoignable. Vérifiez votre connexion.',
    'api.down': 'Le serveur ne répond pas. Réessayez dans un instant.',
    'api.unexpected': 'Réponse inattendue du serveur.',
    'api.failed': 'La requête n’a pas abouti.',

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
    'home.auth.banned': 'Ce compte est fermé. Si vous pensez qu’il s’agit d’une erreur, écrivez-nous depuis la boîte à idées.',
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
    'event.excluded':
      'Vous n’êtes pas autorisé à pronostiquer sur cet événement. Vous pouvez toujours tout consulter. Si vous pensez qu’il s’agit d’une erreur, écrivez-nous depuis la boîte à idées.',

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
    'ranking.discard': 'Sortir {name} de votre liste',
    'ranking.grab': 'Déplacer {name}. Glissez, ou utilisez les flèches.',
    'ranking.add': 'Placer {name}',
    'ranking.fill': 'Remplir par seed',
    'ranking.reset': 'Tout effacer',
    'ranking.hint': 'Glissez pour réordonner. Les flèches marchent aussi.',

    'bracket.round.ROUND_OF_32': 'Seizièmes',
    'bracket.round.ROUND_OF_16': 'Huitièmes',
    'bracket.round.QUARTER': 'Quarts de finale',
    'bracket.round.SEMI': 'Demi-finales',
    'bracket.round.SMALL_FINAL': 'Petite finale',
    'bracket.round.FINAL': 'Finale',
    'bracket.round.LEGACY': 'Legacy',

    'result.title': 'Résultat officiel',
    'result.open': 'Voir le résultat',
    'result.empty': 'Résultat pas encore publié.',
    'result.col.rank': 'Place',
    'result.col.artist': 'Artiste',
    'result.col.mine': 'Votre rang',
    'result.col.gap': 'Écart',
    'result.col.battle': 'Affiche',
    'result.col.official': 'Ce qui s’est passé',
    'result.col.yours': 'Ce que vous aviez dit',
    'result.qualified': 'Qualifié',
    'result.notRanked': 'non classé',
    'result.noPick': 'Pas de pronostic',
    'result.hits': '{n}/{total} qualifiés trouvés',
    'result.winners': '{n}/{total} vainqueurs trouvés',
    'result.ghosts': 'Vous aviez aussi classé, et ils ne sont pas au résultat :',
    'result.hit.matchup': 'Affiche',
    'result.hit.winner': 'Vainqueur',
    'result.hit.score': 'Score',

    'bracket.tbd': 'à déterminer',
    'bracket.winner': 'Vainqueur',
    'bracket.score': 'Score',
    'bracket.score.none': 'Sans avis',
    'bracket.clear': 'Effacer',
    'bracket.clearAll': 'Tout effacer',
    'bracket.called': '{n} affiches tranchées',

    'groups.eyebrow': 'Vos cercles privés',
    'groups.title': 'Groupes',
    'groups.lede':
      'Le classement entre amis, sur les compétitions que vous choisissez, et des commentaires épinglés où vous voulez sur les pronostics des autres. Rien n’est public ici — on entre dans un groupe par un lien, jamais en cherchant.',
    'groups.empty':
      'Vous n’êtes dans aucun groupe. Créez-en un, ou ouvrez le lien d’invitation qu’on vous a envoyé.',
    'groups.create': 'Créer un groupe',
    'groups.create.name': 'Nom',
    'groups.create.name.hint': 'La bande, la ligue du bureau, le serveur Discord…',
    'groups.create.description': 'Description',
    'groups.create.description.hint': 'Facultative. Affichée sur la page d’invitation.',
    'groups.create.submit': 'Créer',
    'groups.full':
      'Vous êtes déjà dans {max} groupes — la limite compte ceux que vous possédez et ceux que vous avez rejoints. Quittez-en un pour en créer un autre.',
    'groups.count': '{n} groupes sur {max}',
    'groups.members': '{n} membres',
    'groups.events': '{n} compétitions',
    'groups.events.none': 'Aucune compétition',
    'groups.role.OWNER': 'Propriétaire',
    'groups.role.MEMBER': 'Membre',

    'group.ladder': 'Classement',
    'group.ladder.empty': 'Rien de scoré pour l’instant.',
    'group.ladder.picks': '{n} pronostics',
    'group.ladder.none': 'aucun pronostic',
    'group.picks': 'Pronostics déposés',
    'group.picks.empty': 'Aucun pronostic déposé ici.',
    'group.picks.of': 'Pronostics de {name}',
    'group.picks.all': 'Tout le monde',
    'group.picks.comments': '{n}',
    'group.picks.pending': 'en attente de résultat',
    'group.members.title': 'Membres',
    'group.joined': 'Arrivé le {date}',
    'group.scope': 'Compétitions',
    'group.scope.lede':
      'Le groupe ne compte que ces compétitions : le classement, les pronostics affichés et ce qui peut être commenté suivent tous cette liste.',
    'group.scope.empty': 'Ce groupe ne suit aucune compétition : il n’y a rien à classer.',
    'group.scope.empty.owner':
      'Choisissez les compétitions sur lesquelles ce groupe joue — rien n’est compté tant que ce n’est pas fait.',
    'group.scope.edit': 'Choisir les compétitions',
    'group.scope.save': 'Enregistrer',
    'group.scope.saved': 'Périmètre mis à jour.',
    'group.scope.keep':
      'Retirer une compétition masque ses pronostics et leurs commentaires. Rien n’est supprimé — remettez-la et tout revient.',
    'group.invite': 'Lien d’invitation',
    'group.invite.short': 'Inviter',
    'group.invite.lede': 'Toute personne ayant un compte beatboxpredictions peut rejoindre par ce lien.',
    'group.invite.copy': 'Copier',
    'group.invite.copied': 'Lien copié.',
    'group.invite.rotate': 'Nouveau lien',
    'group.invite.rotate.confirm':
      'Le lien actuel cesse immédiatement de fonctionner. Ceux qui l’ont encore auront besoin du nouveau. Continuer ?',
    'group.invite.closed': 'Les inscriptions sont fermées. Le lien n’ouvre plus.',
    'group.invite.close': 'Fermer les inscriptions',
    'group.invite.reopen': 'Rouvrir les inscriptions',
    'group.rename': 'Renommer le groupe',
    'group.rename.label': 'Nom',
    'group.transfer': 'Transmettre la propriété',
    'group.transfer.lede':
      'La personne choisie prend la main : elle fixe le périmètre, invite, exclut et dissout. Vous restez dans le groupe comme membre. Le changement est immédiat et vous ne pourrez pas revenir dessus seul.',
    'group.transfer.confirm': 'Transmettre le groupe à {name} ?',
    'group.kick': 'Exclure du groupe',
    'group.kick.confirm': 'Exclure {name} ? Ses commentaires restent — d’autres y ont répondu.',
    'group.leave': 'Quitter le groupe',
    'group.leave.confirm': 'Quitter ce groupe ? Il faudra une nouvelle invitation pour y revenir.',
    'group.dissolve': 'Dissoudre le groupe',
    'group.dissolve.confirm':
      'Dissoudre ce groupe pour tout le monde ? Le classement et tous les commentaires sont perdus. Les pronostics ne le sont pas — ils appartiennent à leurs auteurs.',
    'group.gone': 'Groupe dissous.',
    'group.left': 'Vous avez quitté le groupe.',

    'groups.join.title': 'Rejoindre un groupe',
    'groups.join.lede':
      'On vous a envoyé une invitation ? Collez le lien ou le code ici. Les groupes ne sont listés nulle part — c’est la seule porte d’entrée.',
    'groups.join.field': 'Lien ou code d’invitation',
    'groups.join.submit': 'Continuer',
    'groups.join.invalid': 'Cela ne ressemble ni à un lien ni à un code d’invitation.',

    'join.what': 'Ce que rejoindre implique',
    'join.what.standings': 'Vos points apparaissent au classement de ce groupe, aux côtés de ses membres.',
    'join.what.picks': 'Les membres peuvent lire les pronostics que vous avez déposés, et y épingler des commentaires.',
    'join.what.private': 'Rien ne devient public : cela reste entre les membres de ce groupe.',
    'join.what.leave': 'Vous pouvez partir à tout moment, depuis la page du groupe.',

    'notif.title': 'Notifications',
    'notif.empty': 'Rien de neuf.',
    'notif.markAll': 'Tout marquer comme lu',
    'notif.GROUP_JOIN': '{name} a rejoint {group}',
    'notif.COMMENT_ON_MINE': '{name} a commenté votre pronostic dans {group}',
    'notif.COMMENT_REPLY': '{name} a écrit dans un fil où vous êtes intervenu, dans {group}',
    'notif.EVENT_OPEN': 'Les pronostics sont ouverts pour {event}',
    'notif.someone': 'Un ancien membre',

    'announce.title': 'Affiche d’annonce',
    'announce.lang': 'Langue de l’affiche',
    'announce.banner': 'PRONOSTICS OUVERTS',
    'announce.categories': 'CATÉGORIES',
    'announce.entrants': '{n} inscrits',
    'announce.deadline': 'FERMETURE DES PRONOSTICS',
    'announce.hint':
      'Une story à publier à l’ouverture des pronostics : la compétition, ses dates, les catégories et leur plateau, et la date butoir. Tout le reste est à un clic sur le site.',

    'news.title': 'Nouveautés',
    'news.close': 'Compris',
    'news.new': 'nouveau',
    'news.unread': '{n} nouveauté(s) non lue(s)',
    'news.reread': 'À relire quand vous voulez',
    'news.lede':
      'Tout ce qui a changé pour vous, du plus récent au plus ancien. Cette page reste là — revenez-y autant que vous voulez.',
    'news.r0.title': 'Groupes privés, export en image et classement revu',
    'news.r0.groups':
      'Groupes privés : créez un cercle, partagez son lien d’invitation, et suivez un classement rien qu’entre vous.',
    'news.r0.comments':
      'Épinglez des commentaires où vous voulez sur le pronostic de quelqu’un : sur une ligne de classement, sur une affiche, ou sur une phase entière.',
    'news.r0.bell':
      'Une cloche dans l’en-tête vous prévient quand quelqu’un rejoint votre groupe, commente votre pronostic, ou quand une compétition ouvre.',
    'news.r0.export':
      'Exportez un pronostic en image — post carré, story ou format large — avec le tableau complet et les scores.',
    'news.r0.precision':
      'Le classement remplace la réussite en battle par la Précision : les points marqués rapportés aux points qui étaient en jeu. Attendez-vous à des chiffres plus bas — l’ancienne mesure récompensait ceux qui pronostiquaient mal.',
    'news.r0.search':
      'Cherchez un joueur par son pseudo dans le classement, et cliquez n’importe quel nom pour ouvrir son profil.',
    'news.r0.artists':
      'Les fiches d’artiste détaillent désormais leurs statistiques compétition par compétition, avec un graphique des places qu’on leur donne.',
    'news.r0.jury': 'Une catégorie peut désormais afficher son jury.',
    'news.r0.mobile':
      'Une passe complète sur téléphone : plus de défilement latéral, des fenêtres qui atteignent le bas de l’écran, des zones tactiles plus grandes.',
    'news.r0.logout': 'La déconnexion a déménagé dans votre page de profil.',

    'export.open': 'Exporter',
    'export.title': 'Exporter ce pronostic',
    'export.format.square': 'Post carré',
    'export.format.story': 'Story',
    'export.format.wide': 'Large',
    'export.download': 'Télécharger',
    'export.share': 'Partager…',
    'export.share.unsupported': 'Votre navigateur ne sait pas partager de fichier. Téléchargez l’image à la place.',
    'export.hint':
      'La carte porte le pronostic entier : toutes les phases de classement et tous les tours du tableau, avec les vainqueurs choisis et les scores.',
    'export.stamp.hint': 'Cliquez sur la carte pour poser votre tampon.',
    'export.stamp.none': 'Portez un tampon depuis la boutique pour marquer cette carte.',

    'join.eyebrow': 'Invitation',
    'join.title': 'Rejoindre {name}',
    'join.members': '{n} personnes sont déjà dedans.',
    'join.scope': 'Joue sur : {events}',
    'join.signin':
      'Connectez-vous avec Discord pour rejoindre. Rien n’est jamais publié en votre nom — seuls votre pseudo et votre avatar sont lus.',
    'join.accept': 'Rejoindre le groupe',
    'join.already': 'Vous êtes déjà membre de ce groupe.',
    'join.open': 'Ouvrir le groupe',
    'join.closed': 'Les inscriptions à ce groupe sont fermées. Demandez un lien récent à un membre.',
    'join.full': 'Ce groupe est complet.',
    'join.limit': 'Vous êtes déjà dans {max} groupes. Quittez-en un pour rejoindre celui-ci.',
    'join.invalid': 'Cette invitation n’est pas valide. Elle a peut-être été renouvelée depuis son partage.',

    'pin.mode': 'Épingler un commentaire',
    'pin.mode.on': 'Cliquez l’endroit à épingler',
    'pin.mode.hint': 'Cliquez un rang, une battle ou une phase pour y accrocher votre commentaire.',
    'pin.cancel': 'Annuler',
    'pin.orphan': 'Épinglé à une partie du pronostic qui n’est plus affichée.',
    'thread.title': 'Commentaires',
    'thread.lede': 'Visibles uniquement des membres de {group}.',
    'thread.empty': 'Aucun commentaire. Dites ce que vous pensez de ces pronostics.',
    'thread.placeholder': 'Vous en pensez quoi ?',
    'thread.send': 'Publier',
    'thread.edit': 'Modifier',
    'thread.edited': 'modifié',
    'thread.delete': 'Supprimer',
    'thread.delete.confirm': 'Supprimer ce commentaire ?',
    'thread.save': 'Enregistrer',
    'thread.cancel': 'Annuler',
    'thread.close': 'Fermer',

    'privacy.collect.groups': 'Les groupes rejoints et les commentaires qui y sont écrits',
    'privacy.collect.groups.why':
      'Pour montrer à un groupe son propre classement et ses discussions.',
    'privacy.groups.title': 'Groupes privés',
    'privacy.groups.lede':
      'Un groupe n’existe que pour ses membres. Son nom, son classement et ses commentaires n’apparaissent jamais sur le site public, ne sont pas indexés, et un groupe dont on n’est pas membre est indiscernable d’un groupe qui n’existe pas.',
    'privacy.groups.delete':
      'Supprimer son compte transmet les groupes que l’on possède au membre arrivé le premier ; un groupe n’est dissous que s’il ne reste personne. Les commentaires partent avec le compte.',

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
    'leaderboard.search': 'Chercher un joueur',
    'leaderboard.search.hint': 'Tapez un pseudo…',
    'leaderboard.search.none': 'Aucun joueur ne correspond à « {q} » sur ce périmètre.',
    'leaderboard.clickable':
      'Cliquez un pseudo pour ouvrir son profil et lire les pronostics qu’il a déposés.',
    'leaderboard.col.player': 'Pronostiqueur',
    'leaderboard.col.predictions': 'Pronostics',
    'leaderboard.col.points': 'Points',
    'leaderboard.deleted': 'Compte supprimé',

    'artists.eyebrow': 'Réutilisables d’un événement à l’autre',
    'artists.title': 'Artistes',
    'artists.search': 'Chercher un nom',
    'artists.empty': 'Aucun artiste ne correspond.',
    'artists.unknown': 'Origine inconnue',
    'artists.pointsFrom': 'Points marqués grâce à lui',
    'artists.qualifiedShare': 'Donné qualifié par',
    'artists.qualifiedShareCut': 'Vu dans le top {n} par',
    'artists.averageRank': 'Rang moyen donné',
    'artists.spread': 'Où la foule le place',
    'artists.spread.aria': 'Distribution des places données',
    'artists.voters': '{n} pronostics déposés',
    'artists.bestWorst': 'Meilleur {best} · pire {worst}',
    'artists.byRound': 'Donné vainqueur, par tour',
    'artists.noData': 'Aucun pronostic déposé sur cette compétition.',
    'artists.podiums': 'Podiums',
    'artists.pickedToWin': 'Donné vainqueur d’une battle',
    'artists.accuracy': 'Réussite de ceux qui l’ont pris',
    'artists.appearances': 'Participations',
    'artists.appearances.empty': 'Pas encore engagé sur un événement enregistré.',
    'artists.col.event': 'Événement',
    'artists.col.category': 'Catégorie',
    'artists.col.as': 'Sous le nom de',

    'profile.signin': 'Connectez-vous pour retrouver vos pronostics.',
    'profile.member': 'Inscrit depuis {date}',
    'profile.someoneElse': 'Vous consultez le profil de {name}.',
    'profile.backToMine': 'Revenir au mien',
    'profile.points': 'Points cumulés',
    'profile.submitted': 'Pronostics déposés',
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
    'stats.col.precision': 'Précision',
    'stats.precision': 'Précision moyenne',
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
    'stats.results.open': 'Statistiques des résultats',
    'stats.tab.boards': 'Ce qui a surpris',
    'stats.tooSmall': 'Moins de {n} participants mesurés ici — la liste complète dit déjà tout.',
    'stats.tab.all': 'Tous les participants',
    'stats.results.title': 'Statistiques des résultats',
    'stats.results.subtitle': 'Comment la foule a lu cet événement',
    'stats.results.sampled': '{n} participants mesurés',
    'stats.all': 'Tous les participants',
    'stats.all.lede':
      'Place réelle, place moyenne pronostiquée, et l’écart entre les deux — pour chaque participant d’une phase publiée.',
    'event.deadline': 'Pronostics fermés {date}',
    'event.deadline.none': 'Pas encore de date de fermeture — chaque phase se verrouille à son coup d’envoi',
    'event.deadline.passed': 'Les pronostics sont fermés',
    'event.closed.live':
      'L’événement est en cours — les pronostics sont fermés. Vous pouvez encore consulter vos pronos, mais plus les modifier.',
    'event.judges': '{n} juges',
    'event.jury': 'Jury :',
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
    'help.card.four': 'Top 4 final',
    'help.card.four.hint': 'Une fois par tableau, sur l’arrivée plutôt que sur la route.',
    'help.four.title': 'Le podium final',
    'help.four.first': 'vainqueur',
    'help.four.second': 'finaliste',
    'help.four.third': '3e',
    'help.four.fourth': '4e',
    'help.four.short':
      'Lu dans votre finale et votre petite finale. Un tableau déraille vite : un quart de finale manqué et tout ce qui suit tombe avec lui. Ces points-là ne regardent que l’arrivée — voir juste qui gagne rapporte, quoi qu’il se soit passé en route. La place compte aussi : mettre le vainqueur en finaliste, c’est un autre pronostic.',
    'wc.title': 'Comment se comptent les points d’une sélection',
    'wc.subtitle': '{n} places qualificatives',
    'wc.lede':
      'Pas de tableau ici, pas d’affiches. Une liste d’inscrits, {n} places, et une seule question : qui passe ? Vous classez tout le monde, les points suivent.',
    'wc.card.hit': 'Qualifié deviné',
    'wc.card.hit.hint': 'Par artiste placé dans votre top {n} et réellement retenu.',
    'wc.card.place': 'Place exacte',
    'wc.card.place.hint': 'Par artiste classé au bon rang.',
    'wc.gap.title': 'Le placement',
    'wc.gap.exact': 'exact',
    'wc.gap.beyond': '5 ou plus',
    'wc.gap.short':
      'Chaque artiste rapporte selon l’écart entre votre rang et le rang officiel. Être proche ne fait rien perdre.',
    'wc.hit.title': 'Les qualifiés',
    'wc.hit.short':
      'Trois points par artiste placé dans votre top {n} et réellement retenu — quel que soit le rang que vous lui avez donné. C’est trois fois le point de qualification habituel, parce qu’ici ce n’est pas un détail au bord d’un classement : c’est toute la question.',
    'wc.note':
      'Les deux se cumulent : deviner un qualifié ET le placer au bon rang rapporte 8 points sur ce seul artiste.',
    'wc.board.title': 'Votre top {n}',
    'wc.board.lede':
      'Personne ne sait encore qui a envoyé une wildcard — c’est toute la question. Piochez les artistes que vous voyez passer, puis classez-les.',
    'wc.board.cap': '{n} / {max} choix',
    'wc.board.full': 'Vous avez atteint la limite de {max} choix. Retirez un nom pour en placer un autre.',
    'wc.board.search': 'Ajouter un artiste',
    'wc.board.placeholder': 'Tapez un nom…',
    'wc.board.none': 'Aucun artiste de ce format sous ce nom.',
    'wc.board.count': '{picked} classé(s) · {pool} à placer',
    'wc.board.empty': 'Rien de choisi pour l’instant. Cherchez un nom ci-dessus.',
    'help.title': 'Comment marchent les points',
    'help.matchup.title': 'Un battle rapporte où qu’il se joue',
    'help.close': 'Compris',
    'help.mode.wildcard': 'Sélection wildcard — {n} places',
    'help.mode.bracket': 'Compétition à tableau',
    'help.mode.all': 'Tous les types d’événement',
    'help.kind.wildcard': 'Sélection wildcard',
    'help.kind.bracket': 'Compétition à tableau',
    'help.kind.wildcard.lede': 'Une liste d’inscrits, un nombre de places, une question : qui passe ?',
    'help.kind.bracket.lede': 'Un classement à lire, puis un tableau à composer du premier tour à la finale.',
    'draft.load': 'Version',
    'draft.manage': 'Gérez vos brouillons depuis votre profil.',
    'draft.snapshot': 'Dupliquer en brouillon',
    'draft.blank': 'Brouillon vierge',
    'draft.blank.name': 'Nouveau brouillon',
    'draft.blank.title': 'Partir d’une page blanche',
    'draft.blank.hint':
      'Une version vide, ouverte aussitôt. Ce que vous avez actuellement reste intact dans sa propre version.',
    'draft.blank.confirm': 'Créer et ouvrir',
    'draft.blank.done': '{name} créé. Vous y travaillez désormais.',
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

    /* --- Compte et confidentialité ---------------------------------------- */
    'footer.privacy': 'Politique de confidentialité',
    // Découpé autour du cœur : celui-ci est un élément à part, pour rester
    // annonçable aux lecteurs d'écran. Les espaces comptent.
    'footer.madeby.before': 'Fait avec ',
    'footer.madeby.heart': 'amour',
    'footer.madeby.after': ' par ',
    'footer.madeby.and': ' et ',
    'account.zone': 'Votre compte',
    'account.zone.lede':
      'Emportez vos données, ou fermez votre compte. Les deux sont immédiats et ne demandent aucune justification.',
    'account.export': 'Télécharger mes données',
    'account.export.hint': 'Un fichier JSON avec tout ce que le site détient sur vous.',
    'account.member': 'Membre depuis {date}.',
    'account.delete.open': 'Supprimer mon compte',
    'account.delete.title': 'Supprimer votre compte',
    'account.delete.warning': 'Cette action est définitive. Rien ne pourra être récupéré ensuite.',
    'account.delete.owner':
      'Le compte propriétaire ne peut pas être supprimé — plus personne ne pourrait administrer le site. Transmettez d’abord le rôle.',
    'account.delete.type': 'Saisissez {name} pour confirmer',
    'account.delete.confirm': 'Supprimer définitivement',
    'account.delete.working': 'Suppression…',
    'account.line.predictions': 'pronostics',
    'account.line.points': 'points',
    'account.line.postbox': 'messages envoyés',
    'account.line.visits': 'jours de visite',
    'account.delete.what.predictions': 'Tous vos pronostics, brouillons comme déposés, avec le détail de leur calcul.',
    'account.delete.what.leaderboard': 'Vos points et votre place au classement.',
    'account.delete.what.postbox': 'Les messages que vous nous avez envoyés — les copies déjà relayées sur Discord y restent.',
    'account.delete.what.discord': 'Votre pseudo Discord, votre avatar et votre identifiant.',
    'account.delete.what.again': 'Vous pourrez vous reconnecter ensuite, mais vous repartirez d’un compte vide.',

    'privacy.eyebrow': 'Ce que le site retient',
    'privacy.title': 'Confidentialité',
    'privacy.updated': 'Dernière mise à jour : août 2026.',
    'privacy.lede':
      'BeatboxPredictions est un petit site indépendant. Il garde le moins possible, et uniquement ce dont il a besoin pour fonctionner. Cette page dit quoi, pourquoi, et comment tout faire disparaître.',
    'privacy.collect.title': 'Ce qui est collecté',
    'privacy.collect.lede': 'Rien tant que vous ne vous connectez pas avec Discord. Ensuite :',
    'privacy.collect.discord': 'Votre identifiant Discord, votre pseudo et votre avatar',
    'privacy.collect.discord.why':
      'C’est votre compte. L’identifiant vous relie à vos pronostics ; le pseudo et l’avatar apparaissent au classement. Rien d’autre n’est lu de votre profil Discord — ni votre adresse électronique, ni vos serveurs, ni vos messages.',
    'privacy.collect.predictions': 'Vos pronostics',
    'privacy.collect.predictions.why':
      'Classements, arbres de battles, podiums, et les points qu’ils rapportent. C’est la raison d’être du site.',
    'privacy.collect.visits': 'Les jours où vous êtes venu',
    'privacy.collect.visits.why':
      'Une ligne par personne et par jour, pour que le site sache si quelqu’un l’utilise. Ni quelles pages, ni combien de temps, ni d’où — seulement que vous êtes venu ce jour-là.',
    'privacy.collect.postbox': 'Les messages envoyés par la boîte à idées',
    'privacy.collect.postbox.why':
      'Suggestions et rapports de bug, avec votre nom pour pouvoir vous répondre. Ils sont relayés dans un salon Discord privé.',
    'privacy.collect.not':
      'Aucune adresse IP conservée, aucun cookie de pistage, aucune publicité, aucun service de mesure d’audience, aucun profilage, et rien n’est jamais vendu.',
    'privacy.public.title': 'Ce que les autres voient',
    'privacy.public.lede':
      'Votre pseudo Discord, votre avatar, vos points et vos pronostics déposés sont publics — un classement que personne ne peut lire n’est pas un classement.',
    'privacy.public.hidden':
      'Vos brouillons ne regardent que vous tant que vous ne les avez pas déposés. Vos messages par la boîte à idées ne sont jamais publics.',
    'privacy.cookies.title': 'Cookies',
    'privacy.cookies.lede':
      'Un cookie porte votre session, pour vous garder connecté. Il est technique, nécessaire, et lisible du serveur seul. Votre langue et votre thème restent dans votre navigateur et ne nous parviennent jamais.',
    'privacy.cookies.none': 'Il n’y a aucun autre cookie, et donc aucune bannière : il n’y a rien à accepter.',
    'privacy.third.title': 'Qui d’autre intervient',
    'privacy.third.discord':
      'Discord, pour la connexion et pour relayer les messages de la boîte à idées. Leur propre politique s’applique à ce qui se passe chez eux.',
    'privacy.third.host':
      'Le site tourne sur un serveur loué en France. La base de données est sur ce même serveur et n’est partagée avec personne.',
    'privacy.third.none': 'Personne d’autre. Aucun annonceur, aucun service de mesure, aucun courtier en données.',
    'privacy.keep.title': 'Combien de temps',
    'privacy.keep.lede':
      'Tant que votre compte existe. Supprimez-le et tout part avec, immédiatement. Les traces de visite de plus d’un an ne servent à rien et sont effacées.',
    'privacy.rights.title': 'Vos droits',
    'privacy.rights.lede': 'Aucun formulaire, aucun courriel à envoyer. Tout est un bouton sur votre profil :',
    'privacy.rights.export': 'Télécharger tout ce que le site détient sur vous, en fichier JSON.',
    'privacy.rights.delete': 'Supprimer votre compte et toutes ses données, immédiatement et définitivement.',
    'privacy.rights.fix': 'Votre pseudo et votre avatar se rafraîchissent depuis Discord à chaque connexion — modifiez-les là-bas.',
    'privacy.rights.cta': 'Aller à mon profil',
    'privacy.rights.signin': 'Connectez-vous avec Discord pour accéder à ces commandes.',
    'privacy.contact.title': 'Une question',
    'privacy.contact.lede':
      'Passez par la boîte à idées de la page d’accueil, ou joignez le responsable du site sur le Discord. Il y a une seule personne derrière ce site, et elle lit tout.',

    'shop.eyebrow': 'BOUTIQUE',
    'shop.title': 'La boutique',
    'shop.balance': 'porte-monnaie',
    'shop.balance.lede':
      'Les points gagnés sur les compétitions terminées atterrissent ici. Les dépenser ne touche jamais votre score au classement — celui-là est gravé pour de bon.',
    'shop.signin': 'Connectez-vous avec Discord pour gagner et dépenser des points.',
    'shop.buy': 'Acheter',
    'shop.equip': 'Porter',
    'shop.unequip': 'Retirer',
    'shop.free': 'gratuit',
    'shop.points': 'pts',
    'shop.animated': 'animé',

    'shop.preview': 'Aperçu',
    'shop.preview.note': 'Montré avec le reste de votre tenue. Rien n’est acheté ni porté pour autant.',
    'shop.promo.banner': '{n} objets en promotion jusqu’au {date}. La sélection tourne chaque semaine.',
    'shop.preview.noPrediction': 'Déposez d’abord un pronostic : l’aperçu utilise votre dernier.',
    'shop.preview.noBracket': 'Votre dernier pronostic n’a pas de tableau à tamponner.',
    'shop.stamp.hint': 'Cliquez n’importe où pour tamponner.',
    'shop.stamp.again': 'Cliquez à nouveau pour le déplacer.',
    'shop.live.leaderboard': 'Ligne de classement',
    'shop.live.profile': 'En-tête de profil',
    'shop.live.bracket': 'Affiche de tableau',
    'shop.live.card': 'Carte partagée',

    'shop.section.frame': 'Cadres d’avatar',
    'shop.section.frame.lede':
      'Cinq pixels de large au maximum, collés à la photo. Visibles partout où votre avatar apparaît.',
    'shop.section.nameFx': 'Effets de pseudo',
    'shop.section.nameFx.lede':
      'Rien que des attributs de caractère — aucun dessin, et ça reste lisible dans un tableau dense.',
    'shop.section.band': 'Bandes de profil',
    'shop.section.band.lede':
      'Deux colonnes verticales qui encadrent votre profil. Masquées sur écran étroit.',
    'shop.section.cardSkin': 'Skins de carte d’export',
    'shop.section.cardSkin.lede':
      'Le seul cosmétique que verront des gens sans compte. Le prix en tient compte.',
    'shop.section.stamp': 'Tampons',
    'shop.section.stamp.lede':
      'Une marque apposée sur votre pronostic, conservée sur l’image partagée.',

    'shop.badges': 'Badges',
    'shop.badges.lede':
      'Les badges ne s’achètent pas — ils tombent pour tout le monde à la clôture d’une compétition.',

    'badge.PARTICIPANT': 'Wildcard — un pronostic déposé',
    'badge.BRONZE': 'Top 60 % de la compète',
    'badge.SILVER': 'Top 30 % de la compète',
    'badge.GOLD': 'Top 5 % de la compète',
    'badge.PODIUM_3': 'Troisième — 3e pronostiqueur',
    'badge.PODIUM_2': 'Deuxième — 2e pronostiqueur',
    'badge.PODIUM_1': 'Vainqueur — meilleur pronostiqueur',

    'profile.badges': 'Badges',
    'profile.badges.empty':
      'Aucun badge pour l’instant — ils tombent à la clôture d’une compétition que vous avez pronostiquée.',
    'profile.wallet': 'Porte-monnaie',
    'profile.views': 'Vues du profil',
    'profile.gate': 'Connectez-vous avec Discord pour voir ce profil. Une vue par membre et par jour.',
    'artists.views': 'Vues de la fiche',
    'profile.shop.cta': 'Ouvrir la boutique',

    'stamp.place': 'Poser mon tampon',
    'stamp.move': 'Déplacer mon tampon',
    'stamp.cancel': 'Annuler',
    'stamp.remove': 'Retirer le tampon',
    'stamp.hint': 'Cliquez où vous voulez sur le tableau pour le poser. Échap pour annuler.',
    'group.stamp.by': 'Tamponné par {name}',
    'group.stamp.none': 'Portez un tampon pour laisser votre marque ici.',
    'group.stamp.invite': 'Vous pouvez tamponner ce pronostic.',
    'group.stamp.hint': 'Cliquez où vous voulez sur la fiche pour tamponner.',
    'group.stamp.remove': 'Retirer mon tampon',
    'group.stamp.count': '{n} tampon(s)',

    'common.close': 'Fermer',

    'badge.rule': 'Comment il tombe',
    'badge.awarded': 'Obtenu le {date}.',

    'badge.PARTICIPANT.name': 'La wildcard',
    'badge.BRONZE.name': 'Une facette',
    'badge.SILVER.name': 'Deux facettes',
    'badge.GOLD.name': 'Cube plein',
    'badge.PODIUM_3.name': 'Troisième place',
    'badge.PODIUM_2.name': 'Deuxième place',
    'badge.PODIUM_1.name': 'Vainqueur',

    'badge.PARTICIPANT.detail':
      'Un pronostic déposé sur la compétition.',
    'badge.BRONZE.detail':
      'Top 60 % des pronostiqueurs.',
    'badge.SILVER.detail':
      'Top 30 % des pronostiqueurs.',
    'badge.GOLD.detail':
      'Top 5 % des pronostiqueurs.',
    'badge.PODIUM_3.detail':
      'Troisième meilleur pronostiqueur.',
    'badge.PODIUM_2.detail':
      'Deuxième meilleur pronostiqueur de la compète.',
    'badge.PODIUM_1.detail':
      'Meilleur pronostiqueur de la compète.',
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

/**
 * Un traducteur pour une langue donnée, utilisable HORS du contexte React.
 *
 * `useI18n` ne sert que dans un composant, et sa langue est celle de
 * l'interface. Or l'affiche d'annonce se publie sur Instagram pour une audience
 * internationale : on la veut en anglais tout en naviguant en français, sans
 * avoir à basculer le site entier avant chaque export puis à penser à revenir.
 *
 * Même repli que `t` : une clé absente d'une langue retombe sur l'anglais,
 * plutôt que d'afficher son identifiant au milieu d'une affiche.
 */
export function translator(lang) {
  return (key, vars) => {
    const raw = DICT[lang]?.[key] ?? DICT.en[key];
    if (raw == null) return key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
}

/** Le format de date d'une langue, pour les mêmes usages hors composant. */
export function localeOf(lang) {
  return LANGS.find((l) => l.id === lang)?.locale ?? 'en-GB';
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être appelé sous <I18nProvider>');
  return ctx;
}