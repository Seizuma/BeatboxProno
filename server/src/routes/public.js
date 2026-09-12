import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withName } from '../lib/naming.js';
import { walletBalance } from '../lib/badges.js';
import { requireAuth } from '../lib/auth.js';
import { countViews, recordView } from '../lib/views.js';

export const publicRouter = Router();

/**
 * L'ordre d'une compétition, du premier tour au dernier.
 *
 * La petite finale se joue AVANT la finale et s'affiche donc avant elle. C'est
 * l'ordre du plateau et celui du calendrier ; tout autre choix demanderait une
 * explication.
 *
 * Un tour absent de cette liste se range en tête plutôt que de disparaître —
 * `indexOf` rend -1, ce qui est un défaut acceptable : mieux vaut un tour mal
 * placé qu'un tour perdu.
 */
const ROUND_ORDER = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER',
  'SEMI',
  'SMALL_FINAL',
  'FINAL',
  'LEGACY',
];

/**
 * Express 4 n'attrape PAS le rejet d'un handler asynchrone.
 *
 * Ce n'est pas une erreur silencieuse, c'est pire : la requête reste
 * suspendue jusqu'au délai d'expiration, sans réponse et sans une ligne de
 * log. Côté navigateur, la page tourne indéfiniment — le symptôme le plus
 * difficile à relier à sa cause, parce qu'il ne ressemble pas à une erreur.
 *
 * Les autres routeurs du projet ont ce garde depuis longtemps ; celui-ci ne
 * l'avait pas, et ses six handlers asynchrones étaient à une exception près
 * de faire tourner une page dans le vide.
 */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isStaff = (user) => Boolean(user) && ['ADMIN', 'OWNER'].includes(user.role);

const visible = (user) =>
  user && ['ADMIN', 'OWNER'].includes(user.role)
    ? {}
    : { status: { not: 'DRAFT' } };

/**
 * L'ordre des tours d'un tableau, pour retrouver celui qui ouvre la phase.
 *
 * Doit rester d'accord avec `MAIN_LINE` de `bracket.js` : c'est la même notion,
 * dupliquée ici parce que cette route n'a pas besoin du reste du module. Sans
 * ROUND_OF_32, un tableau à 32 voyait ses seizièmes ignorés et la censure
 * s'appliquait au mauvais tour.
 */
const MAIN_LINE = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];

/**
 * Ce qu'une phase montre aux joueurs tant qu'elle n'est pas PUBLIÉE.
 *
 * L'administration promet que tant qu'on n'a pas cliqué « Publier », « rien
 * n'est encore visible des joueurs ». Ce n'était pas vrai : la route renvoyait
 * les affiches officielles telles quelles, vainqueurs compris. Pire, les
 * affiches des tours aval sont composées automatiquement à partir des
 * résultats saisis — enregistrer les quarts remplissait les demi-finales
 * officielles, et cette composition partait au joueur. Elle lui révélait le
 * résultat réel ET gelait son arbre : son propre vainqueur de quart ne montait
 * plus en demie.
 *
 * On ne laisse donc passer que le squelette, plus le tirage du premier tour —
 * lui est public, il est connu avant que rien ne se joue.
 */
function redactPhase(phase, drawPublished = true) {
  if (phase.resolved) return phase;

  const rounds = new Set((phase.battles ?? []).map((b) => b.round));
  // Le tirage du premier tour n'est public qu'une fois la qualification jouée.
  // Avant, les appariements en base sont ceux que l'éditeur d'organisateur
  // compose seul à partir du classement officiel : ils révèlent qui est qualifié
  // et s'imposent à l'arbre du joueur alors qu'ils ne sont le tirage de personne.
  const firstRound = drawPublished ? MAIN_LINE.find((r) => rounds.has(r)) ?? null : null;

  return {
    ...phase,
    // Un classement saisi mais pas publié est un résultat comme un autre.
    entries: (phase.entries ?? []).map((e) => ({ ...e, rank: null, qualified: false })),
    // seedPairs reste exposé : c'est le FORMAT du tableau, pas un résultat.
    // Le joueur doit savoir qui affrontera qui avant de classer ses wildcards,
    // sinon il compose à l'aveugle.
    battles: (phase.battles ?? []).map((b) => ({
      id: b.id,
      phaseId: b.phaseId,
      round: b.round,
      slot: b.slot,
      label: b.label,
      // Les affiches Legacy sont composées à la main, sans tour amont : elles
      // ne trahissent aucun résultat, on les garde.
      contenderAId: b.round === firstRound || b.round === 'LEGACY' ? b.contenderAId : null,
      contenderBId: b.round === firstRound || b.round === 'LEGACY' ? b.contenderBId : null,
      winnerId: null,
      scoreA: null,
      scoreB: null,
      played: false,
    })),
  };
}

const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];

/**
 * Applique la redaction à toutes les phases d'un événement.
 *
 * La décision se prend au niveau de la CATÉGORIE, pas de la phase : savoir si
 * le tirage d'un tableau est public suppose de regarder la qualification qui
 * l'alimente, laquelle est une autre phase.
 */
function redactEvent(event) {
  for (const category of event.categories ?? []) {
    const phases = category.phases ?? [];
    const qualifying = [...phases].filter((p) => RANKING_TYPES.includes(p.type)).pop();
    const drawPublished = !qualifying || Boolean(qualifying.resolved);
    category.phases = phases.map((p) => redactPhase(p, drawPublished));
  }
  return event;
}

const categoryInclude = {
  contenders: {
    include: { artists: { include: { artist: true } } },
    orderBy: { seed: 'asc' },
  },
  phases: {
    orderBy: { position: 'asc' },
    include: {
      entries: { orderBy: { rank: 'asc' } },
      battles: { orderBy: [{ round: 'asc' }, { slot: 'asc' }] },
    },
  },
};

publicRouter.get('/events', guard(async (req, res) => {
  const events = await prisma.event.findMany({
    where: visible(req.user),
    orderBy: [{ startsAt: 'desc' }, { year: 'desc' }],
    include: {
      categories: {
        orderBy: { position: 'asc' },
        // `nameEn` voyage avec le nom : les pastilles de l'accueil affichent des
        // noms de catégorie, et sans cette colonne elles resteraient en
        // français sur un site basculé en anglais.
        select: { id: true, name: true, nameEn: true, slug: true, kind: true },
      },
      // Uniquement les pronostics déposés : les brouillons sont privés, et les
      // compter gonflait le compteur public de l'accueil.
      _count: { select: { predictions: { where: { submitted: true } } } },
    },
  });
  res.json({ events });
}));

publicRouter.get('/events/:slug', guard(async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { slug: req.params.slug, ...visible(req.user) },
    include: {
      categories: { orderBy: { position: 'asc' }, include: categoryInclude },
    },
  });
  if (!event) return res.status(404).json({ error: 'Événement introuvable.' });

  /**
   * Ce compte est-il écarté de cet événement ?
   *
   * Annoncé à l'ouverture de la page plutôt que découvert au premier
   * enregistrement. Laisser quelqu'un composer un tableau entier pour lui
   * répondre « non » au moment de déposer serait une perte de temps infligée
   * gratuitement — et il ne comprendrait pas ce qui lui arrive.
   *
   * Le motif ne descend PAS : il est écrit pour l'administration. La page dit
   * que la porte est fermée, pas pourquoi.
   */
  let excluded = false;
  if (req.user) {
    excluded = Boolean(
      await prisma.eventExclusion.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: req.user.id } },
        select: { id: true },
      })
    );
  }

  let myPredictions = [];
  if (req.user) {
    // Toutes mes versions, pas seulement la déposée : la page événement laisse
    // basculer de l'une à l'autre.
    myPredictions = await prisma.prediction.findMany({
      where: { userId: req.user.id, eventId: event.id },
      include: { ranks: true, battles: true },
      orderBy: [{ submitted: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  // Les noms se résolvent ici, une fois pour toutes : le client n'a pas à
  // savoir qu'un participant peut suivre son artiste.
  for (const category of event.categories) {
    category.contenders = category.contenders.map(withName);
  }

  /**
   * La censure ne s'applique pas aux organisateurs.
   *
   * Elle existe pour empêcher qu'un résultat saisi mais pas encore publié
   * fuite vers les joueurs. Appliquée à l'administrateur lui-même, elle lui
   * renvoyait ses propres classements avec `rank: null` — l'éditeur de tableau
   * ne trouvait donc aucun qualifié et refusait de composer le premier tour
   * tant que les éliminations n'étaient pas publiées.
   *
   * C'est exactement l'inverse du besoin : on prépare le tableau AVANT de
   * publier, pour vérifier qu'il tient debout. La page événement rend donc les
   * données brutes au staff, comme elle lui rend déjà les événements en
   * brouillon.
   */
  res.json({
    excluded,
    event: isStaff(req.user) ? event : redactEvent(event),
    myPredictions,
  });
}));

/**
 * Le détail d'un pronostic, lisible par tout le monde.
 *
 * Deux conditions : le pronostic doit avoir été DÉPOSÉ — un brouillon reste
 * privé, sans quoi on lirait les hésitations des autres — et son événement doit
 * être visible. Le propriétaire, lui, accède aussi à ses propres brouillons.
 */
publicRouter.get('/predictions/:predictionId', guard(async (req, res) => {
  const prediction = await prisma.prediction.findUnique({
    where: { id: req.params.predictionId },
    include: {
      user: {
        select: {
          id: true, username: true, globalName: true, avatarUrl: true,
          equippedFrame: true, equippedNameFx: true,
          // Le skin habille la carte exportée depuis CE pronostic : il suit donc
          // son auteur, pas son lecteur. Une carte doit ressembler à ce que la
          // personne qui l'a faite a choisi, même consultée par quelqu'un d'autre.
          equippedCardSkin: true,
        },
      },
      event: { select: { slug: true, name: true, year: true, status: true, judgeCount: true } },
      category: {
        select: {
          name: true,
          kind: true,
          phases: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, type: true, resolved: true, qualifierCount: true },
          },
          contenders: {
            select: {
              id: true,
              name: true,
              seed: true,
              imageUrl: true,
              artists: { select: { artist: { select: { name: true, imageUrl: true } } } },
            },
          },
        },
      },
      ranks: true,
      battles: true,
    },
  });

  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  /**
   * Les brouillons : privés, sauf pour leur auteur et pour l'organisation.
   *
   * ─── Pourquoi l'organisation y a droit ──────────────────────────────────────
   *
   * La recherche d'administration sait DÉJÀ lister les brouillons — la case
   * « inclure les brouillons » existe et fonctionne. Mais « Ouvrir » butait
   * ici : on pouvait voir qu'un brouillon existait sans jamais l'ouvrir, ce qui
   * est le pire des deux mondes. Une modération qui ne peut pas regarder ce
   * qu'elle modère ne sert à rien, et la suppression d'un pronostic — qui,
   * elle, était déjà permise — est un geste autrement plus lourd que sa
   * lecture.
   *
   * ─── Ce que ça ne change pas ────────────────────────────────────────────────
   *
   * Rien pour les joueurs entre eux : `isStaff` ne recouvre que ADMIN et OWNER.
   * On ne lit toujours pas les hésitations de son voisin.
   */
  const mine = req.user?.id === prediction.userId;
  if (!mine && !prediction.submitted && !isStaff(req.user)) {
    return res.status(403).json({ error: "Ce brouillon n'est pas public." });
  }
  if (prediction.event.status === 'DRAFT' && !['ADMIN', 'OWNER'].includes(req.user?.role)) {
    return res.status(404).json({ error: 'Pronostic introuvable.' });
  }

  prediction.category.contenders = prediction.category.contenders.map(withName);
  res.json({ prediction });
}));

/** Classement général ou par événement. */
publicRouter.get('/leaderboard', guard(async (req, res) => {
  const { event: eventSlug } = req.query;

  const where = { submitted: true };
  if (eventSlug) {
    const ev = await prisma.event.findUnique({ where: { slug: String(eventSlug) } });
    if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
    where.eventId = ev.id;
  }

  const rows = await prisma.prediction.groupBy({
    by: ['userId'],
    where,
    _sum: { points: true },
    _count: { _all: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 200,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: {
      id: true, username: true, globalName: true, avatarUrl: true,
      // Le cadre et l'effet de pseudo voyagent avec le nom : un cosmétique
      // visible du seul propriétaire ne se vend pas.
      equippedFrame: true, equippedNameFx: true,
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  res.json({
    scope: eventSlug ?? 'general',
    leaderboard: rows.map((r, i) => ({
      position: i + 1,
      user: byId.get(r.userId),
      points: r._sum.points ?? 0,
      predictions: r._count._all,
    })),
  });
}));

/* ---------------------------------------------------------------------------
   La recherche générale
   --------------------------------------------------------------------------- */

/**
 * Deux caractères avant de chercher.
 *
 * En dessous, la requête ramènerait la moitié de la base pour une frappe qui
 * n'est pas encore une intention : personne ne cherche « a ».
 */
const SEARCH_MIN = 2;

/** Ce qu'on renvoie par famille. Au-delà, on affine plutôt qu'on déroule. */
const SEARCH_PER_KIND = 6;

/**
 * Le rang d'une correspondance.
 *
 * Postgres rend les lignes dans l'ordre qu'on lui demande, pas dans l'ordre de
 * pertinence : « ALEM » et « SALEM » sortaient à égalité sur « alem ». Un début
 * de nom vaut mieux qu'un milieu de nom, et une égalité vaut mieux que tout le
 * reste. Trois rangs suffisent — au-delà on invente une science.
 */
function matchRank(needle, ...fields) {
  let best = 3;
  for (const field of fields) {
    if (!field) continue;
    const hay = String(field).toLowerCase();
    if (hay === needle) return 0;
    if (hay.startsWith(needle)) best = Math.min(best, 1);
    else if (hay.includes(needle)) best = Math.min(best, 2);
  }
  return best;
}

/**
 * Chercher un joueur, un artiste, une compétition ou un de ses groupes.
 *
 * ─── Pourquoi cette route existe ────────────────────────────────────────────
 *
 * On peut déjà filtrer le classement par pseudo, et la question « peut-on voir
 * les pronostics des autres ? » continuait de revenir. C'est le signe que la
 * réponse était là où personne ne la cherchait : dans un champ d'une page
 * précise, plutôt que dans l'en-tête où l'on cherche partout ailleurs.
 *
 * ─── Ce que chaque famille expose ───────────────────────────────────────────
 *
 * Les compétitions passent par `visible()` : les brouillons ne sortent que pour
 * l'organisation, exactement comme sur `/events`.
 *
 * Les artistes sont ouverts — leur fiche l'est aussi, c'est la meilleure porte
 * d'entrée du site.
 *
 * Les joueurs demandent une session, parce que `/users/:id` en demande une. Les
 * rendre trouvables sans compte fabriquerait des liens qui refusent d'ouvrir,
 * et publierait de fait une liste d'inscrits.
 *
 * Les groupes sont privés : on ne renvoie que ceux dont la personne est déjà
 * membre. La recherche aide à retrouver le sien, elle ne fait pas l'annuaire de
 * ceux des autres.
 *
 * ─── Les alias d'artiste ────────────────────────────────────────────────────
 *
 * `has` est une égalité, pas un « contient » : Prisma ne sait pas chercher un
 * fragment dans un tableau Postgres sans requête brute. On cherche donc l'alias
 * exact, ce qui couvre le cas réel — on tape « Napom », pas « Napo ».
 */
publicRouter.get('/search', guard(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  if (q.length < SEARCH_MIN) return res.json({ query: q, results: [] });

  const needle = q.toLowerCase();
  const like = { contains: q, mode: 'insensitive' };
  // « 2026 » est un millésime avant d'être un morceau de nom.
  const year = /^\d{4}$/.test(q) ? Number(q) : null;

  const [events, artists, players, groups] = await Promise.all([
    prisma.event.findMany({
      where: {
        ...visible(req.user),
        OR: [{ name: like }, { location: like }, ...(year ? [{ year }] : [])],
      },
      select: { slug: true, name: true, year: true, location: true, status: true },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      take: 20,
    }),

    prisma.artist.findMany({
      where: { OR: [{ name: like }, { aliases: { has: q } }] },
      select: { slug: true, name: true, country: true, imageUrl: true, aliases: true },
      orderBy: { name: 'asc' },
      take: 20,
    }),

    req.user
      ? prisma.user.findMany({
        where: { OR: [{ username: like }, { globalName: like }] },
        select: {
          id: true,
          username: true,
          globalName: true,
          avatarUrl: true,
          // La tenue voyage avec le nom, ici comme au classement : un cadre
          // payé qui ne se montrerait qu'en fin de parcours ne vaut rien.
          equippedFrame: true,
          equippedNameFx: true,
        },
        take: 20,
      })
      : [],

    req.user
      ? prisma.group.findMany({
        where: { name: like, members: { some: { userId: req.user.id } } },
        select: { slug: true, name: true, _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
        take: 20,
      })
      : [],
  ]);

  /**
   * Une seule liste, triée par pertinence puis par famille.
   *
   * Un résultat porte SON type : c'est lui qui dit au lecteur ce qu'il va
   * ouvrir. Sans ça, « GBB 2026 » et « GBB » — la compète et le groupe qui la
   * suit — se ressemblent au point qu'on clique au hasard.
   */
  const rows = [
    ...players.map((u) => ({
      kind: 'player',
      rank: matchRank(needle, u.globalName, u.username),
      to: `/players/${u.id}`,
      label: u.globalName ?? u.username,
      hint: u.globalName && u.globalName !== u.username ? `@${u.username}` : null,
      avatarUrl: u.avatarUrl,
      frameId: u.equippedFrame,
      nameFx: u.equippedNameFx,
    })),
    ...artists.map((a) => ({
      kind: 'artist',
      rank: matchRank(needle, a.name, ...(a.aliases ?? [])),
      to: `/artists/${a.slug}`,
      label: a.name,
      hint: a.country,
      avatarUrl: a.imageUrl,
    })),
    ...events.map((e) => ({
      kind: 'event',
      rank: matchRank(needle, e.name, e.location, String(e.year)),
      to: `/events/${e.slug}`,
      label: `${e.name} ${e.year}`,
      hint: e.location,
      status: e.status,
    })),
    ...groups.map((g) => ({
      kind: 'group',
      rank: matchRank(needle, g.name),
      to: `/groups/${g.slug}`,
      label: g.name,
      // Un NOMBRE, pas une phrase : « 3 membres » et « 3 members » se composent
      // côté écran, où vit le dictionnaire. Le serveur ne parle aucune langue.
      members: g._count.members,
    })),
  ];

  // Le plafond s'applique PAR famille et après le tri : sans quoi vingt
  // artistes homonymes évinceraient le seul joueur cherché.
  const kept = [];
  const seen = { player: 0, artist: 0, event: 0, group: 0 };
  for (const row of rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))) {
    if (seen[row.kind] >= SEARCH_PER_KIND) continue;
    seen[row.kind] += 1;
    kept.push(row);
  }

  res.json({ query: q, results: kept });
}));

/** Fiche publique d'un pronostiqueur. */
/**
 * Le profil d'un joueur.
 *
 * `requireAuth` : la fiche est réservée aux membres. Deux raisons, et la
 * seconde compte plus que la première. Un compteur de vues n'a de sens que si
 * chaque vue a un visage — sinon il compte surtout des robots d'indexation. Et
 * un profil rassemble points, historique et badges de quelqu'un : le rendre
 * lisible sans compte, c'est le publier.
 */
publicRouter.get('/users/:id', requireAuth, guard(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      username: true,
      globalName: true,
      avatarUrl: true,
      createdAt: true,
      role: true,
      // La tenue est publique par nature : un cosmétique qui ne se montre qu'à
      // soi-même ne vaudrait pas un point. Ni le skin de carte ni le tampon,
      // en revanche — ils ne s'affichent pas sur un profil, et ce qu'on ne
      // montre pas, on ne le transporte pas.
      equippedFrame: true,
      equippedNameFx: true,
      equippedBand: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const predictions = await prisma.prediction.findMany({
    where: { userId: user.id, ...(req.user?.id === user.id ? {} : { submitted: true }) },
    include: {
      // `predictionsCloseAt` en plus du statut : c'est lui qui décide si un
      // dépôt est encore effaçable, et l'écran doit pouvoir cacher un bouton
      // que le serveur refuserait.
      event: {
        select: {
          slug: true, name: true, year: true, status: true, predictionsCloseAt: true,
        },
      },
      // `nameEn` manquait ici : le profil est le seul écran qui lit les
      // pronostics par cette route, et il affichait donc les noms de catégorie
      // en français même en anglais.
      category: { select: { name: true, nameEn: true, slug: true, kind: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  /**
   * Les compteurs suivent le statut de l'ÉVÉNEMENT, jamais `scoredAt`.
   *
   * `scoredAt` dit « ce pronostic est passé par le calculateur », ce qui n'est
   * pas la même chose que « son résultat est connu ». Il se pose au gré des
   * recalculs, donc au gré des manipulations d'organisateur : deux personnes du
   * même événement affichaient des états différents selon le moment où elles
   * avaient déposé. La question posée à l'écran — « où en est mon pronostic ? »
   * — se répond avec l'état de la compète, pas avec un horodatage technique.
   *
   *   déposés  : tous les pronostics déposés, compète en cours ou terminée
   *   attente  : déposés dont la compète n'est pas terminée
   *   terminés : déposés dont la compète l'est
   *   brouillons : jamais déposés
   */
  const totals = predictions.reduce(
    (acc, p) => {
      if (!p.submitted) {
        acc.drafts += 1;
        return acc;
      }
      acc.submitted += 1;
      acc.points += p.points;
      if (p.event.status === 'FINISHED') acc.finished += 1;
      else acc.pending += 1;
      return acc;
    },
    { points: 0, submitted: 0, finished: 0, pending: 0, drafts: 0 }
  );

  // Le mur de badges, public lui aussi — c'est un palmarès, pas un secret.
  // Trié par date en base, regroupé par compète côté client : l'ordre à
  // l'intérieur d'une compète dépend du prestige, que seul le catalogue connaît.
  const badges = await prisma.badgeAward.findMany({
    where: { userId: user.id },
    // `badgeSet` voyage avec la compète : c'est lui qui dit QUEL dessin
    // afficher. Sans lui, le mur retomberait sur une seule famille et deux
    // compètes aux médailles différentes se ressembleraient.
    include: { event: { select: { slug: true, name: true, year: true, badgeSet: true } } },
    orderBy: { awardedAt: 'desc' },
  });

  // Le solde, en revanche, n'appartient qu'à soi : montrer le porte-monnaie des
  // autres inviterait à comparer des dépenses plutôt que des pronostics.
  const wallet = req.user?.id === user.id ? await walletBalance(user.id) : null;

  // La consultation est notée puis comptée — dans cet ordre, pour que la
  // personne qui vient d'arriver se voie dans le total plutôt que de découvrir
  // un chiffre en retard d'une visite. On ne l'attend pas : `recordView` ne lève
  // jamais, mais rien n'oblige à retarder la réponse pour un ornement.
  recordView({ viewerId: req.user.id, userId: user.id });
  const views = await countViews({ userId: user.id });

  res.json({ user, predictions, totals, badges, wallet, views });
}));

/**
 * Stats d'un artiste : sur combien de pronostics les gens l'ont vu gagner,
 * et à quelle fréquence ils ont eu raison.
 */
publicRouter.get('/artists', guard(async (_req, res) => {
  const artists = await prisma.artist.findMany({ orderBy: { name: 'asc' } });
  res.json({ artists });
}));

/**
 * La fiche d'un artiste. OUVERTE, contrairement aux profils de joueurs.
 *
 * La distinction n'est pas une inconséquence. Un profil rassemble les points,
 * l'historique et les badges de quelqu'un : le rendre lisible sans compte, ce
 * serait le publier. Une fiche d'artiste ne parle de personne d'inscrit — c'est
 * une page sur un beatboxer, le genre de lien qu'on partage sur un Discord et
 * qu'un moteur indexe. La fermer coûterait au site sa meilleure porte d'entrée.
 *
 * Le compteur, lui, ne bouge pas : seuls les visiteurs connectés y figurent, et
 * `recordView` s'en charge en sortant tout de suite quand il n'y a pas de
 * session. On compte donc des membres, pas des passages.
 */
publicRouter.get('/artists/:slug', guard(async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { slug: req.params.slug },
    include: {
      entries: {
        include: {
          contender: {
            include: {
              category: {
                include: {
                  event: true,
                  // La STRUCTURE de la catégorie, pas seulement ses résultats :
                  // c'est elle qui dit quels chiffres ont un sens ici. Une
                  // Loopstation en tableau direct ne classe personne, donc
                  // « donné qualifié par » et « rang moyen » n'y existent pas —
                  // et un tiret à leur place n'est pas une information, c'est
                  // une case remplie parce qu'elle existe.
                  //
                  // Déduit de la structure et non du nombre de votes : une
                  // catégorie avec éliminations où personne n'a encore
                  // pronostiqué doit afficher « 0 % », pas disparaître.
                  phases: { select: { type: true, qualifierCount: true, position: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!artist) return res.status(404).json({ error: 'Artiste introuvable.' });

  const RANKING_TYPES = ['SEEDING', 'WILDCARD', 'ELIMINATION'];

  const contenderIds = artist.entries.map((e) => e.contenderId);
  const categoryIds = [...new Set(artist.entries.map((e) => e.contender.categoryId))];

  /**
   * Tout ce qui suit est groupé PAR CATÉGORIE, et c'est le point de cette route.
   *
   * Les chiffres agrégés sur toute la carrière d'un artiste mélangeaient des
   * compétitions qui n'ont rien à voir : « donné qualifié par 31 % » sur un
   * beatboxer entré 20e à Varsovie et 1er à Beatland ne décrit aucune des deux
   * situations. La moyenne de deux vérités contradictoires n'est pas une
   * vérité, c'est une bouillie.
   *
   * Seuls les POINTS restent additionnés : eux se cumulent réellement, ils
   * comptent ce que la foule a gagné grâce à lui, toutes compètes confondues.
   */
  const [battles, picks, placements, scored] = await Promise.all([
    // Les battles officielles JOUÉES où il apparaît : elles servent au
    // dénominateur de la fiabilité, jamais au décompte des pronostics.
    prisma.battle.findMany({
      where: {
        played: true,
        OR: [{ contenderAId: { in: contenderIds } }, { contenderBId: { in: contenderIds } }],
      },
      select: {
        phaseId: true,
        round: true,
        contenderAId: true,
        contenderBId: true,
        winnerId: true,
        phase: { select: { categoryId: true } },
      },
    }),

    /**
     * Les fois où quelqu'un l'a donné vainqueur d'une battle.
     *
     * Une seule condition : le pronostic doit avoir été DÉPOSÉ. Chacun peut
     * garder dix brouillons par catégorie, et les compter revenait à mesurer le
     * nombre de fois où quelqu'un avait hésité.
     *
     * Ce qu'il ne faut SURTOUT pas exiger en plus, c'est que l'affiche existe
     * déjà officiellement. Une première version le faisait, et le compteur
     * tombait à zéro sur toute compétition à venir : avant le tirage, aucune
     * battle n'est en base. Or c'est précisément avant la compète que la
     * question intéresse.
     */
    prisma.predictedBattle.findMany({
      where: { winnerId: { in: contenderIds }, prediction: { submitted: true } },
      select: {
        round: true,
        phaseId: true,
        contenderAId: true,
        contenderBId: true,
        winnerId: true,
        phase: { select: { categoryId: true } },
      },
    }),

    // Les places qu'on lui donne en classement. La coupe voyage avec, parce
    // qu'elle change d'une compétition à l'autre : un top 8 et un top 16 ne
    // racontent pas la même histoire pour un même rang.
    prisma.predictedRank.findMany({
      where: { contenderId: { in: contenderIds }, prediction: { submitted: true } },
      select: {
        rank: true,
        phase: { select: { categoryId: true, qualifierCount: true } },
      },
    }),

    /**
     * Le détail de score des pronostics déjà confrontés aux résultats, dans les
     * catégories où il concourt.
     *
     * Restreint à ses catégories : sans ce filtre, la requête ramènerait le
     * détail de tous les pronostics du site pour n'en garder qu'une poignée.
     */
    categoryIds.length
      ? prisma.prediction.findMany({
        where: { categoryId: { in: categoryIds }, submitted: true, scoredAt: { not: null } },
        select: { breakdown: true, categoryId: true },
      })
      : [],
  ]);

  const owned = new Set(contenderIds);

  /** Un jeu de compteurs vierge, par catégorie. */
  const blank = () => ({
    ranks: [],
    cut: null,
    cutSeen: 0,
    cutThrough: 0,
    pickedToWin: 0,
    byRound: new Map(),
    judged: 0,
    correct: 0,
    points: 0,
  });

  const byCategory = new Map(categoryIds.map((id) => [id, blank()]));
  const bucket = (categoryId) => {
    if (!byCategory.has(categoryId)) byCategory.set(categoryId, blank());
    return byCategory.get(categoryId);
  };

  // --- Les places données en classement
  for (const p of placements) {
    const categoryId = p.phase?.categoryId;
    if (!categoryId) continue;
    const b = bucket(categoryId);
    b.ranks.push(p.rank);

    // Sans coupe déclarée, la phase ne qualifie personne : la compter
    // fausserait la part dans les deux sens selon les compétitions.
    const cut = p.phase.qualifierCount;
    if (!cut) continue;
    b.cut = cut;
    b.cutSeen += 1;
    if (p.rank <= cut) b.cutThrough += 1;
  }

  // --- Les vainqueurs annoncés, et le tour où on les annonce
  for (const pick of picks) {
    const categoryId = pick.phase?.categoryId;
    if (!categoryId) continue;
    const b = bucket(categoryId);
    b.pickedToWin += 1;
    b.byRound.set(pick.round, (b.byRound.get(pick.round) ?? 0) + 1);
  }

  // --- La fiabilité, sur les seules battles disputées
  const playedByKey = new Map(
    battles.map((b) => [
      `${b.phaseId}:${b.round}:${[b.contenderAId, b.contenderBId].sort().join('|')}`,
      b,
    ])
  );

  for (const pick of picks) {
    const hit = playedByKey.get(
      `${pick.phaseId}:${pick.round}:${[pick.contenderAId, pick.contenderBId].sort().join('|')}`
    );
    if (!hit) continue;
    const b = bucket(pick.phase.categoryId);
    b.judged += 1;
    if (hit.winnerId === pick.winnerId) b.correct += 1;
  }

  /**
   * Les points marqués sur des lignes où il figure.
   *
   * Le barème attribue ses points à des lignes : un placement en classement,
   * une affiche de bracket. On additionne celles qui le mentionnent. Les points
   * d'une affiche sont comptés en entier, sans les répartir entre les deux
   * adversaires : une battle bien lue l'est grâce aux deux, et couper en deux
   * produirait des demi-points que personne ne saurait interpréter.
   */
  let pointsFrom = 0;
  for (const { breakdown, categoryId } of scored) {
    if (!Array.isArray(breakdown)) continue;
    for (const section of breakdown) {
      for (const line of section?.lines ?? []) {
        const mentions =
          owned.has(line.contenderId) ||
          owned.has(line.contenderAId) ||
          owned.has(line.contenderBId);
        if (!mentions) continue;
        const points = line.points ?? 0;
        pointsFrom += points;
        bucket(categoryId).points += points;
      }
    }
  }

  // --- Mise en forme, une entrée par participation
  const appearances = artist.entries.map((e) => {
    const c = e.contender;
    const b = bucket(c.categoryId);
    const voters = b.ranks.length;

    const phases = c.category.phases ?? [];
    const ranking = [...phases]
      .filter((p) => RANKING_TYPES.includes(p.type))
      .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
      .pop() ?? null;
    const hasBracket = phases.some((p) => !RANKING_TYPES.includes(p.type));

    // La coupe vient de la PHASE, pas des votes : elle existe même si personne
    // n'a encore pronostiqué, et c'est ce qui permet d'afficher « 0 % » plutôt
    // que de masquer la carte.
    const cut = ranking?.qualifierCount ?? null;

    // La distribution des places : c'est elle qui se lit d'un coup d'œil.
    // « Rang moyen 10,3 » ne dit pas si tout le monde le voit dixième ou si la
    // moitié le voit premier et l'autre vingtième — deux situations opposées
    // derrière le même nombre.
    const counts = new Map();
    for (const rank of b.ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
    const distribution = [...counts.entries()]
      .map(([rank, n]) => ({ rank, n }))
      .sort((x, y) => x.rank - y.rank);

    return {
      contenderId: c.id,
      event: c.category.event.name,
      eventSlug: c.category.event.slug,
      year: c.category.event.year,
      status: c.category.event.status,
      category: c.category.name,
      contender: c.name,
      seed: c.seed,
      points: b.points,
      // Ce que cette catégorie est capable de produire comme chiffres.
      has: { ranking: Boolean(ranking), cut: Boolean(cut), bracket: hasBracket },
      crowd: {
        voters,
        averageRank: voters ? Math.round((b.ranks.reduce((n, r) => n + r, 0) / voters) * 10) / 10 : null,
        bestRank: voters ? Math.min(...b.ranks) : null,
        worstRank: voters ? Math.max(...b.ranks) : null,
        cut,
        // Zéro et non `null` quand la coupe existe mais que personne n'a
        // encore voté : « 0 % » se lit, un tiret laisse croire à une panne.
        qualifiedShare: b.cutSeen ? Math.round((b.cutThrough / b.cutSeen) * 100) : cut ? 0 : null,
        distribution,
        pickedToWin: b.pickedToWin,
        // Dans l'ordre de la compétition, et non dans celui où les pronostics
        // ont été rencontrés. Une Map conserve l'ordre d'INSERTION : la fiche
        // affichait donc les tours dans un ordre qui ne dépendait que du hasard
        // des lectures — finale avant quarts, selon les jours.
        byRound: [...b.byRound.entries()]
          .map(([round, n]) => ({ round, n }))
          .sort((x, y) => ROUND_ORDER.indexOf(x.round) - ROUND_ORDER.indexOf(y.round)),
        judged: b.judged,
        correct: b.correct,
        accuracy: b.judged ? Math.round((b.correct / b.judged) * 100) : null,
      },
    };
  });

  // `req.user?.id` et non `req.user.id` : la route est ouverte, il n'y a pas
  // toujours quelqu'un derrière. `recordView` sort sans rien faire sur un
  // visiteur anonyme.
  recordView({ viewerId: req.user?.id, artistId: artist.id });
  const views = await countViews({ artistId: artist.id });

  res.json({
    artist: {
      id: artist.id,
      slug: artist.slug,
      name: artist.name,
      country: artist.country,
      imageUrl: artist.imageUrl,
      bio: artist.bio,
    },
    // Le seul chiffre qui se cumule honnêtement d'une compétition à l'autre.
    totals: { pointsFrom },
    views,
    appearances,
  });
}));