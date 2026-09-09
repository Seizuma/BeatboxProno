import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { contenderName, withName } from '../lib/naming.js';
import { maxScoreForEvent } from '../lib/maxscore.js';
import { scorePrediction } from '../lib/scoring.js';
import { notifyEventOpen } from '../lib/notifications.js';
import { settleEvent } from '../lib/badges.js';
import { WILDCARD_KINDS, MIN_PLACES, MAX_PLACES } from '../lib/wildcard.js';
import {
  validateSeedPairs,
  patternFor,
  reresolvePhase,
  firstRoundOf,
  reseedOfficialBracket,
} from '../lib/seeding.js';
import { lastDays, localDay } from '../lib/presence.js';
// La suppression d'un compte est la MÊME que celle de la page de profil : une
// seule procédure, groupes transmis compris.
import { deleteAccount } from '../lib/accounts.js';

export const adminRouter = Router();
adminRouter.use(requireRole('ADMIN', 'OWNER'));

const onlyAdmin = requireRole('ADMIN', 'OWNER');
const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- Artistes -----------------------------------------------------------------

adminRouter.post('/artists', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    country: z.string().optional().nullable(),
    aliases: z.array(z.string()).default([]),
    kinds: z
      .array(z.enum(['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'PRODUCER']))
      .default([]),
    // Les photos servies depuis /api/media/artists sont des chemins relatifs :
    // exiger une URL absolue les refuserait.
    imageUrl: z.string().min(1).optional().nullable(),
    bio: z.string().optional().nullable(),
  });
  const data = schema.parse(req.body);
  const artist = await prisma.artist.create({
    data: { ...data, slug: slugify(data.name) },
  });
  res.status(201).json({ artist });
});

// --- Ce qu'une suppression emporte --------------------------------------------

/**
 * Rien ne se supprime à l'aveugle. Chaque route de suppression commence par
 * établir son bilan, le renvoie en 409 si l'administrateur n'a pas confirmé, et
 * ne passe à l'acte qu'avec `?confirm=true`. L'interface s'appuie sur le même
 * bilan pour afficher la fenêtre de confirmation : une seule source de vérité,
 * pas deux formulations qui divergent.
 */
async function artistImpact(artistId) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      entries: {
        include: {
          contender: {
            include: {
              _count: { select: { artists: true } },
              category: { include: { event: { select: { name: true, year: true } } } },
            },
          },
        },
      },
    },
  });
  if (!artist) return null;

  const contenders = artist.entries.map((e) => ({
    id: e.contender.id,
    name: contenderName(e.contender),
    category: e.contender.category.name,
    event: `${e.contender.category.event.name} ${e.contender.category.event.year}`,
    // Un participant peut réunir plusieurs artistes (« Colaps & Zekka ») : il ne
    // devient orphelin que si celui-ci était le dernier.
    orphaned: e.contender._count.artists <= 1,
  }));

  return {
    kind: 'artist',
    name: artist.name,
    imageUrl: artist.imageUrl,
    contenders,
    orphans: contenders.filter((c) => c.orphaned),
    events: [...new Set(contenders.map((c) => c.event))],
  };
}

async function eventImpact(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      categories: {
        include: { _count: { select: { contenders: true, predictions: true, phases: true } } },
      },
      _count: { select: { predictions: true } },
    },
  });
  if (!event) return null;

  return {
    kind: 'event',
    name: `${event.name} ${event.year}`,
    status: event.status,
    predictions: event._count.predictions,
    categories: event.categories.map((c) => ({
      name: c.name,
      contenders: c._count.contenders,
      phases: c._count.phases,
      predictions: c._count.predictions,
    })),
  };
}

async function categoryImpact(categoryId) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      event: { select: { name: true, year: true } },
      _count: { select: { contenders: true, phases: true, predictions: true } },
    },
  });
  if (!category) return null;

  return {
    kind: 'category',
    name: category.name,
    event: `${category.event.name} ${category.event.year}`,
    contenders: category._count.contenders,
    phases: category._count.phases,
    predictions: category._count.predictions,
  };
}

async function contenderImpact(contenderId) {
  const contender = await prisma.contender.findUnique({
    where: { id: contenderId },
    include: {
      category: { include: { event: { select: { name: true, year: true } } } },
      _count: {
        select: { phaseEntries: true, predictedRanks: true, battlesAsA: true, battlesAsB: true },
      },
    },
  });
  if (!contender) return null;

  return {
    kind: 'contender',
    name: contenderName(contender),
    category: contender.category.name,
    event: `${contender.category.event.name} ${contender.category.event.year}`,
    // Les affiches où il apparaît : les retirer laisse des trous dans l'arbre.
    battles: contender._count.battlesAsA + contender._count.battlesAsB,
    rankings: contender._count.phaseEntries,
    predictedRanks: contender._count.predictedRanks,
  };
}

const IMPACT_LOADERS = {
  artist: artistImpact,
  event: eventImpact,
  category: categoryImpact,
  contender: contenderImpact,
};

/** L'interface interroge ce bilan avant d'ouvrir sa fenêtre de confirmation. */
adminRouter.get('/impact/:kind/:id', async (req, res) => {
  const load = IMPACT_LOADERS[req.params.kind];
  if (!load) return res.status(400).json({ error: `Type inconnu : ${req.params.kind}` });
  const impact = await load(req.params.id);
  if (!impact) return res.status(404).json({ error: 'Élément introuvable.' });
  res.json({ impact });
});

/**
 * Suppression d'un artiste.
 *
 * La cascade de la base ne retire que le lien participant↔artiste : le
 * participant, lui, survivait sans plus personne derrière — d'où les fantômes
 * restés dans les événements. On nettoie donc explicitement les participants
 * dont c'était le dernier artiste, sauf demande contraire.
 *
 *   ?confirm=true    obligatoire dès qu'il y a le moindre impact
 *   ?keep=true       conserve les participants orphelins (nom libre)
 */
/**
 * Modifier un artiste. Le renommer se répercute immédiatement partout — fiches,
 * arbres de battles, pronostics déjà déposés — puisque les participants qui le
 * suivent ne recopient plus son nom.
 *
 * Le slug bouge avec le nom : c'est lui qui sert à l'appariement des photos.
 * L'ancien nom est versé dans les alias, pour que les fichiers déjà nommés
 * continuent d'être reconnus.
 */
/**
 * Typer plusieurs artistes d'un coup.
 *
 * Après l'introduction des formats, une base existante se retrouve avec des
 * dizaines d'artistes non typés — invisibles dans les sélecteurs. Les reprendre
 * un par un serait décourageant.
 *
 * `mode` : 'add' ajoute les formats aux existants, 'set' les remplace.
 */
adminRouter.post('/artists/bulk-kinds', async (req, res) => {
  const { ids, kinds, mode } = z
    .object({
      ids: z.array(z.string()).min(1),
      kinds: z
        .array(z.enum(['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'PRODUCER']))
        .min(1),
      mode: z.enum(['add', 'set']).default('add'),
    })
    .parse(req.body);

  const targets = await prisma.artist.findMany({
    where: { id: { in: ids } },
    select: { id: true, kinds: true },
  });

  await prisma.$transaction(
    targets.map((a) =>
      prisma.artist.update({
        where: { id: a.id },
        data: { kinds: mode === 'set' ? kinds : [...new Set([...a.kinds, ...kinds])] },
      })
    )
  );

  res.json({ updated: targets.length });
});

adminRouter.patch('/artists/:id', async (req, res) => {
  const data = z
    .object({
      name: z.string().min(1).optional(),
      country: z.string().max(60).nullable().optional(),
      bio: z.string().max(2000).nullable().optional(),
      kinds: z
        .array(z.enum(['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'PRODUCER']))
        .optional(),
      aliases: z.array(z.string().min(1)).optional(),
    })
    .parse(req.body);

  const current = await prisma.artist.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: 'Artiste introuvable.' });

  const patch = { ...data };
  if (data.name && data.name !== current.name) {
    patch.slug = slugify(data.name);
    patch.aliases = [...new Set([...(data.aliases ?? current.aliases), current.name])];
  }

  const artist = await prisma.artist.update({ where: { id: current.id }, data: patch });
  res.json({ artist });
});

adminRouter.delete('/artists/:id', onlyAdmin, async (req, res) => {
  const impact = await artistImpact(req.params.id);
  if (!impact) return res.status(404).json({ error: 'Artiste introuvable.' });

  const hasImpact = impact.contenders.length > 0;
  if (hasImpact && req.query.confirm !== 'true') {
    return res.status(409).json({
      error: `${impact.name} est engagé sur ${impact.contenders.length} participation(s). Confirmez pour continuer.`,
      impact,
    });
  }

  const orphanIds = req.query.keep === 'true' ? [] : impact.orphans.map((c) => c.id);

  await prisma.$transaction([
    // D'abord les participants devenus vides, ensuite l'artiste : dans l'autre
    // sens, la cascade aurait déjà effacé les liens qui les identifient.
    ...(orphanIds.length
      ? [prisma.contender.deleteMany({ where: { id: { in: orphanIds } } })]
      : []),
    prisma.artist.delete({ where: { id: req.params.id } }),
  ]);

  res.json({ ok: true, removedContenders: orphanIds.length, impact });
});

// --- Événements ---------------------------------------------------------------

adminRouter.post('/events', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    year: z.number().int(),
    location: z.string().optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    description: z.string().optional().nullable(),
    coverUrl: z.string().url().optional().nullable(),
    // 3 juges par défaut. Détermine les scores proposés aux pronostiqueurs.
    judgeCount: z.number().int().min(1).max(9).optional(),
    // Volontairement nullable : wildcards ouvertes, date encore inconnue.
    predictionsCloseAt: z.coerce.date().optional().nullable(),
  });
  const data = schema.parse(req.body);
  const event = await prisma.event.create({
    data: { ...data, slug: slugify(`${data.name}-${data.year}`) },
  });
  res.status(201).json({ event });
});

adminRouter.patch('/events/:id', async (req, res) => {
  // Le corps était passé tel quel à Prisma : n'importe quelle colonne pouvait
  // être écrite depuis le client, et une date arrivait en chaîne de caractères.
  const data = z
    .object({
      name: z.string().min(1).optional(),
      year: z.number().int().optional(),
      location: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      coverUrl: z.string().url().nullable().optional(),
      status: z.enum(['DRAFT', 'OPEN', 'LIVE', 'FINISHED']).optional(),
      startsAt: z.coerce.date().nullable().optional(),
      endsAt: z.coerce.date().nullable().optional(),
      judgeCount: z.number().int().min(1).max(9).optional(),
      // null efface la date butoir : c'est le cas « wildcards ouvertes, date
      // de la compète encore inconnue ».
      predictionsCloseAt: z.coerce.date().nullable().optional(),
    })
    .parse(req.body);

  /**
   * L'annonce d'ouverture part sur la TRANSITION, pas sur l'état.
   *
   * Sans cette lecture préalable, chaque enregistrement d'un événement déjà
   * ouvert renotifierait la totalité des comptes.
   */
  const before = await prisma.event.findUnique({
    where: { id: req.params.id },
    select: { status: true },
  });

  const event = await prisma.event.update({ where: { id: req.params.id }, data });

  let announced = null;
  if (data.status === 'OPEN' && before?.status !== 'OPEN') {
    announced = await notifyEventOpen(event.id);
  }

  /**
   * La clôture distribue badges et porte-monnaie — sur la TRANSITION vers
   * FINISHED, comme l'annonce d'ouverture, et pour la même raison : un état se
   * ré-enregistre, une transition n'arrive qu'à la bascule.
   *
   * L'opération est rejouable : re-basculer LIVE → FINISHED après un recalcul
   * de points CORRIGE badges et crédits, sans jamais les dupliquer. C'est le
   * geste à faire quand un résultat change après coup.
   */
  let settled = null;
  if (data.status === 'FINISHED' && before?.status !== 'FINISHED') {
    settled = await settleEvent(event.id);
  }

  res.json({ event, announced, settled });
});

adminRouter.delete('/events/:id', onlyAdmin, async (req, res) => {
  const impact = await eventImpact(req.params.id);
  if (!impact) return res.status(404).json({ error: 'Événement introuvable.' });

  const hasImpact = impact.categories.length > 0 || impact.predictions > 0;
  if (hasImpact && req.query.confirm !== 'true') {
    return res.status(409).json({
      error: `Cet événement porte ${impact.categories.length} catégorie(s) et ${impact.predictions} pronostic(s). Confirmez pour continuer.`,
      impact,
    });
  }

  await prisma.event.delete({ where: { id: req.params.id } });
  res.json({ ok: true, impact });
});

// --- Catégories, contenders, phases -------------------------------------------

adminRouter.post('/events/:eventId/categories', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    kind: z.enum(['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'LEGACY']),
    position: z.number().int().default(0),
  });
  const data = schema.parse(req.body);
  const category = await prisma.category.create({
    data: { ...data, slug: slugify(data.name), eventId: req.params.eventId },
  });
  res.status(201).json({ category });
});

/**
 * Ajout d'un participant à une catégorie.
 *
 * Un participant n'est jamais créé sans artiste derrière. C'est la règle qui
 * manquait : en Crew et Tag Team, on saisissait « Berywam » ou « Colaps &
 * Zekka » au clavier sans rattacher personne, et ces noms n'existaient nulle
 * part ailleurs — ni dans la liste des artistes, ni avec une photo, ni avec une
 * fiche. Faute d'artiste fourni, on en crée un du même nom (ou on réutilise
 * celui qui existe déjà sous ce slug).
 *
 * Les deux modèles restent possibles : un crew peut être UN artiste à lui seul,
 * ou réunir ses membres. Ce qui est interdit, c'est zéro.
 */
adminRouter.post('/categories/:categoryId/contenders', async (req, res) => {
  const schema = z.object({
    // Vide : le participant suit le nom de ses artistes, et une correction
    // ultérieure se propage partout. On ne le renseigne que pour un duo ou un
    // crew dont le nom n'appartient à aucun artiste isolé.
    name: z.string().min(1).nullable().optional(),
    seed: z.number().int().nullable().optional(),
    wildcard: z.boolean().default(false),
    artistIds: z.array(z.string()).default([]),
    imageUrl: z.string().min(1).nullable().optional(),
    country: z.string().max(60).nullable().optional(),
  });
  const { artistIds, country, ...data } = schema.parse(req.body);

  const contender = await prisma.$transaction(async (tx) => {
    let linked = artistIds;

    if (linked.length === 0) {
      if (!data.name) {
        throw Object.assign(new Error('Indiquez un artiste ou un nom.'), { status: 400 });
      }
      const slug = slugify(data.name);
      const artist =
        (await tx.artist.findUnique({ where: { slug } })) ??
        (await tx.artist.create({ data: { name: data.name, slug, country: country ?? null } }));
      linked = [artist.id];
    }

    return tx.contender.create({
      data: {
        ...data,
        name: data.name ?? null,
        categoryId: req.params.categoryId,
        artists: { create: linked.map((artistId) => ({ artistId })) },
      },
      include: { artists: { include: { artist: true } } },
    });
  });

  res.status(201).json({ contender });
});

/**
 * Les participants sans aucun artiste rattaché — les fantômes hérités d'avant
 * la règle ci-dessus, ou d'un import. Le rapport propose pour chacun l'artiste
 * qui porte déjà le même slug, quand il en existe un.
 */
adminRouter.get('/orphan-contenders', async (_req, res) => {
  const orphans = await prisma.contender.findMany({
    where: { artists: { none: {} } },
    include: {
      category: { include: { event: { select: { name: true, year: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  const slugs = [...new Set(orphans.map((c) => slugify(c.name)))];
  const existing = slugs.length
    ? await prisma.artist.findMany({ where: { slug: { in: slugs } } })
    : [];
  const bySlug = new Map(existing.map((a) => [a.slug, a]));

  res.json({
    orphans: orphans.map((c) => {
      const match = bySlug.get(slugify(c.name));
      return {
        id: c.id,
        name: c.name,
        seed: c.seed,
        category: c.category.name,
        kind: c.category.kind,
        event: `${c.category.event.name} ${c.category.event.year}`,
        // Un artiste porte déjà ce nom : on rattachera plutôt que de dupliquer.
        match: match ? { id: match.id, name: match.name, imageUrl: match.imageUrl } : null,
      };
    }),
  });
});

/**
 * Répare les participants orphelins : rattache ceux qui ont un homonyme,
 * crée l'artiste manquant pour les autres. Idempotent — on peut le relancer.
 */
adminRouter.post('/orphan-contenders/repair', async (req, res) => {
  const only = Array.isArray(req.body?.ids) ? new Set(req.body.ids) : null;

  const orphans = await prisma.contender.findMany({
    where: { artists: { none: {} }, name: { not: null } },
    select: { id: true, name: true },
  });
  const todo = only ? orphans.filter((c) => only.has(c.id)) : orphans;

  let linked = 0;
  let created = 0;

  for (const contender of todo) {
    const slug = slugify(contender.name);
    // Séquentiel et non en parallèle : deux participants du même nom dans deux
    // catégories doivent aboutir au même artiste, pas à deux doublons.
    await prisma.$transaction(async (tx) => {
      let artist = await tx.artist.findUnique({ where: { slug } });
      if (artist) linked += 1;
      else {
        artist = await tx.artist.create({ data: { name: contender.name, slug } });
        created += 1;
      }
      await tx.contenderArtist.create({
        data: { contenderId: contender.id, artistId: artist.id },
      });
    });
  }

  res.json({ repaired: todo.length, linked, created });
});

adminRouter.delete('/contenders/:id', async (req, res) => {
  const impact = await contenderImpact(req.params.id);
  if (!impact) return res.status(404).json({ error: 'Participant introuvable.' });

  const hasImpact = impact.battles > 0 || impact.rankings > 0 || impact.predictedRanks > 0;
  if (hasImpact && req.query.confirm !== 'true') {
    return res.status(409).json({
      error: `${impact.name} apparaît dans ${impact.battles} affiche(s) et ${impact.predictedRanks} pronostic(s). Confirmez pour continuer.`,
      impact,
    });
  }

  await prisma.contender.delete({ where: { id: req.params.id } });
  res.json({ ok: true, impact });
});

adminRouter.post('/categories/:categoryId/phases', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    type: z.enum(['SEEDING', 'WILDCARD', 'ELIMINATION', 'BRACKET', 'LEGACY']),
    position: z.number().int().default(0),
    qualifierCount: z.number().int().nullable().optional(),
    locksAt: z.coerce.date().nullable().optional(),
  });
  const phase = await prisma.phase.create({
    data: { ...schema.parse(req.body), categoryId: req.params.categoryId },
  });
  res.status(201).json({ phase });
});

adminRouter.patch('/phases/:id', async (req, res) => {
  const phase = await prisma.phase.update({ where: { id: req.params.id }, data: req.body });
  res.json({ phase });
});

adminRouter.post('/phases/:phaseId/battles', async (req, res) => {
  const schema = z.object({
    // Les mêmes tours que le type énuméré de la base. Sans ROUND_OF_32, la
    // création d'une affiche de seizièmes est refusée alors que le format
    // Top 32 existe au catalogue.
    round: z.enum([
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTER',
      'SEMI',
      'SMALL_FINAL',
      'FINAL',
      'LEGACY',
    ]),
    slot: z.number().int().min(0),
    label: z.string().nullable().optional(),
    contenderAId: z.string().nullable().optional(),
    contenderBId: z.string().nullable().optional(),
  });
  const battle = await prisma.battle.create({
    data: { ...schema.parse(req.body), phaseId: req.params.phaseId },
  });
  res.status(201).json({ battle });
});

// --- Formats de compétition ---------------------------------------------------

/**
 * La forme d'un tableau, par taille. Chaque entrée dit combien d'affiches
 * compte chaque tour — c'est tout ce qu'il faut pour engendrer le squelette,
 * puisque le reste (qui affronte qui) se déduit du classement pronostiqué.
 */
export const BRACKET_FORMATS = {
  TOP_32: {
    label: 'Top 32',
    size: 32,
    rounds: [['ROUND_OF_32', 16], ['ROUND_OF_16', 8], ['QUARTER', 4], ['SEMI', 2], ['FINAL', 1]],
  },
  TOP_16: { label: 'Top 16', size: 16, rounds: [['ROUND_OF_16', 8], ['QUARTER', 4], ['SEMI', 2], ['FINAL', 1]] },
  TOP_8: { label: 'Top 8', size: 8, rounds: [['QUARTER', 4], ['SEMI', 2], ['FINAL', 1]] },
  TOP_4: { label: 'Top 4', size: 4, rounds: [['SEMI', 2], ['FINAL', 1]] },
  TOP_2: { label: 'Finale seule', size: 2, rounds: [['FINAL', 1]] },
};

export const CATEGORY_KINDS = {
  SOLO: 'Solo',
  TAG_TEAM: 'Tag Team',
  LOOPSTATION: 'Loopstation',
  CREW: 'Crew',
  LEGACY: 'Legacy',
};

/** Le catalogue, pour que l'interface n'ait pas à dupliquer ces constantes. */
adminRouter.get('/formats', (_req, res) => {
  res.json({
    brackets: Object.entries(BRACKET_FORMATS).map(([id, f]) => ({
      id,
      label: f.label,
      size: f.size,
      rounds: f.rounds.map(([round, count]) => ({ round, count })),
    })),
    kinds: Object.entries(CATEGORY_KINDS).map(([id, label]) => ({ id, label })),
    // Les sélections sur vidéo. Elles portent une DISCIPLINE réelle — c'est
    // elle qui décide quels artistes on peut engager — et un nom qui dit la
    // nuance que la discipline ignore : mixte, féminine.
    wildcards: WILDCARD_KINDS,
    places: { min: MIN_PLACES, max: MAX_PLACES },
  });
});

/**
 * Monte la structure d'un événement d'un seul geste : catégories, phases et
 * squelette d'affiches. C'est ce que faisait le script de seed, en formulaire.
 *
 * Body : { categories: [{ kind, name?, format, wildcard?, wildcardCount?,
 *                         smallFinal?, legacyBattles? }], mode: 'add'|'replace' }
 *
 * `replace` refuse de partir si des pronostics existent déjà sur la catégorie :
 * supprimer une catégorie emporte les pronostics de tout le monde avec elle.
 */
adminRouter.post('/events/:eventId/format', async (req, res) => {
  const schema = z.object({
    mode: z.enum(['add', 'replace']).default('add'),
    force: z.boolean().default(false),
    categories: z
      .array(
        z.object({
          kind: z.enum(['SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'LEGACY']),
          name: z.string().min(1).optional(),
          format: z.enum(['TOP_32', 'TOP_16', 'TOP_8', 'TOP_4', 'TOP_2']).default('TOP_8'),
          // Deux paliers indépendants. Les wildcards passent en premier : c'est
          // la sélection sur vidéo, avant les éliminations sur scène.
          wildcard: z.boolean().default(false),
          wildcardCount: z.number().int().min(2).max(200).nullable().optional(),
          elimination: z.boolean().default(false),
          eliminationCount: z.number().int().min(2).max(200).nullable().optional(),
          smallFinal: z.boolean().default(false),
          legacyBattles: z.number().int().min(1).max(16).default(4),

          /**
           * Une SÉLECTION sur vidéo : pas de tableau, pas d'affiches. Une liste
           * d'inscrits, un nombre de places, et un classement à pronostiquer.
           *
           * `places` est libre entre 1 et 100 : une sélection peut retenir un
           * seul nom comme en retenir quarante, et rien ne justifie de
           * n'autoriser que les puissances de deux — ce n'est pas un tableau.
           */
          wildcardOnly: z.boolean().default(false),
          places: z.number().int().min(MIN_PLACES).max(MAX_PLACES).optional(),
        })
      )
      .min(1),
  });
  const { categories, mode, force } = schema.parse(req.body);

  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: 'Événement introuvable.' });

  const existing = await prisma.category.findMany({
    where: { eventId: event.id },
    include: { _count: { select: { predictions: true } } },
  });

  // Garde-fou : on ne détruit pas des pronostics déposés sans le dire.
  if (mode === 'replace' && !force) {
    const atRisk = existing.filter((c) => c._count.predictions > 0);
    if (atRisk.length) {
      return res.status(409).json({
        error:
          `Des pronostics existent déjà sur : ${atRisk.map((c) => c.name).join(', ')}. ` +
          `Remplacer les effacerait. Relancez avec force:true si c'est bien l'intention.`,
        categories: atRisk.map((c) => ({ id: c.id, name: c.name, predictions: c._count.predictions })),
      });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    if (mode === 'replace') {
      await tx.category.deleteMany({ where: { eventId: event.id } });
    }

    const out = [];
    for (const [index, spec] of categories.entries()) {
      const name = spec.name ?? CATEGORY_KINDS[spec.kind];
      const bracket = BRACKET_FORMATS[spec.format];

      const category = await tx.category.create({
        data: {
          eventId: event.id,
          name,
          slug: slugify(name),
          kind: spec.kind,
          position: index,
        },
      });

      let position = 0;

      /**
       * Une sélection s'arrête là : une phase de classement, et c'est tout.
       *
       * Pas de squelette d'affiches, donc rien à propager, rien à recomposer
       * quand le classement change. C'est aussi ce qui la rend reconnaissable
       * ensuite — une catégorie à phase unique de type WILDCARD, et le reste du
       * site en déduit la règle sans qu'on ait eu à poser un drapeau.
       */
      if (spec.wildcardOnly) {
        await tx.phase.create({
          data: {
            categoryId: category.id,
            name,
            type: 'WILDCARD',
            position: 0,
            qualifierCount: spec.places ?? bracket.size,
          },
        });
        out.push({ id: category.id, name, battles: 0, places: spec.places ?? bracket.size });
        continue;
      }

      // Les paliers de qualification, dans l'ordre : wildcards puis
      // éliminations. Chacun est facultatif et peut exister sans l'autre.
      if (spec.wildcard) {
        await tx.phase.create({
          data: {
            categoryId: category.id,
            name: 'Wildcards',
            type: 'WILDCARD',
            position: position++,
            qualifierCount: spec.wildcardCount ?? bracket.size * 2,
          },
        });
      }
      if (spec.elimination) {
        await tx.phase.create({
          data: {
            categoryId: category.id,
            name: 'Éliminations',
            type: 'ELIMINATION',
            position: position++,
            qualifierCount: spec.eliminationCount ?? bracket.size,
          },
        });
      }

      // Le tableau lui-même.
      const rounds =
        spec.kind === 'LEGACY'
          ? [['LEGACY', spec.legacyBattles]]
          : [
            ...bracket.rounds.filter(([r]) => r !== 'FINAL'),
            ...(spec.smallFinal && bracket.rounds.some(([r]) => r === 'SEMI')
              ? [['SMALL_FINAL', 1]]
              : []),
            ['FINAL', 1],
          ];

      const phase = await tx.phase.create({
        data: {
          categoryId: category.id,
          name: spec.kind === 'LEGACY' ? 'Legacy' : `Tableau — ${bracket.label}`,
          type: spec.kind === 'LEGACY' ? 'LEGACY' : 'BRACKET',
          position: position++,
        },
      });

      // Le squelette : des affiches vides, que le classement pronostiqué
      // viendra remplir côté joueur.
      const battles = rounds.flatMap(([round, count]) =>
        Array.from({ length: count }, (_, slot) => ({ phaseId: phase.id, round, slot }))
      );
      await tx.battle.createMany({ data: battles });

      out.push({ id: category.id, name, battles: battles.length });
    }
    return out;
  });

  res.status(201).json({ categories: created });
});

/**
 * Retoucher le format d'une catégorie DÉJÀ montée.
 *
 * `POST /events/:eventId/format` compose un événement vierge : il crée. Ce qu'il
 * ne sait pas faire, c'est revenir sur une catégorie existante — et l'oubli le
 * plus courant est la petite finale, qu'on ne découvre manquante qu'en voulant
 * saisir son résultat. Jusqu'ici la seule issue était de tout remplacer, ce qui
 * emporte les pronostics déjà déposés.
 *
 * Cette route RÉCONCILIE : elle compare la forme voulue à celle en place et ne
 * touche qu'à la différence. Ajouter une petite finale à un Top 32 crée une
 * affiche et n'en déplace aucune autre.
 *
 * Tout ce qui détruit est compté d'abord et renvoyé en 409 : l'organisateur voit
 * ce qu'il s'apprête à perdre — des affiches jouées, des pronostics déposés —
 * avant de confirmer avec `force`. C'est la même prudence que le mode
 * « replace », appliquée au grain de l'affiche.
 */
adminRouter.put('/categories/:id/format', async (req, res) => {
  const schema = z.object({
    format: z.enum(['TOP_32', 'TOP_16', 'TOP_8', 'TOP_4', 'TOP_2']),
    smallFinal: z.boolean().default(false),
    wildcard: z.boolean().default(false),
    wildcardCount: z.number().int().min(2).max(200).nullable().optional(),
    elimination: z.boolean().default(false),
    eliminationCount: z.number().int().min(2).max(200).nullable().optional(),
    force: z.boolean().default(false),
  });
  const spec = schema.parse(req.body);

  const category = await prisma.category.findUnique({
    where: { id: req.params.id },
    include: {
      phases: {
        orderBy: { position: 'asc' },
        include: {
          battles: true,
          _count: { select: { predictedRanks: true, entries: true } },
        },
      },
    },
  });
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable.' });

  // Une catégorie Legacy n'a pas de forme à déduire : ses affiches sont
  // composées une par une, et c'est l'écran des affiches qui les gère.
  if (category.kind === 'LEGACY') {
    return res.status(400).json({
      error: "Une catégorie Legacy se compose affiche par affiche, pas par format.",
    });
  }

  const bracket = category.phases.find((p) => p.type === 'BRACKET');
  if (!bracket) {
    return res.status(400).json({
      error: "Cette catégorie n'a pas de tableau. Passez par « Paramétrer le format ».",
    });
  }

  const shape = BRACKET_FORMATS[spec.format];

  // La forme voulue, dans l'ordre de RESOLVE_ORDER : la petite finale s'intercale
  // avant la finale, et seulement si le format a des demies — sans demies, il n'y
  // a pas de perdants à opposer.
  const targetRounds = [
    ...shape.rounds.filter(([r]) => r !== 'FINAL'),
    ...(spec.smallFinal && shape.rounds.some(([r]) => r === 'SEMI') ? [['SMALL_FINAL', 1]] : []),
    ['FINAL', 1],
  ];
  const targetKeys = new Set(
    targetRounds.flatMap(([round, count]) =>
      Array.from({ length: count }, (_, slot) => `${round}:${slot}`)
    )
  );

  const current = new Map(bracket.battles.map((b) => [`${b.round}:${b.slot}`, b]));
  const toCreate = [...targetKeys]
    .filter((k) => !current.has(k))
    .map((k) => {
      const [round, slot] = k.split(':');
      return { phaseId: bracket.id, round, slot: Number(slot) };
    });
  const toDelete = [...current.entries()].filter(([k]) => !targetKeys.has(k)).map(([, b]) => b);

  // Les phases de qualification : présentes ou non, c'est un booléen de part et
  // d'autre. Le nombre de qualifiés, lui, se met à jour sur place.
  const wildcardPhase = category.phases.find((p) => p.type === 'WILDCARD');
  const eliminationPhase = category.phases.find((p) => p.type === 'ELIMINATION');
  const phasesToDelete = [
    ...(!spec.wildcard && wildcardPhase ? [wildcardPhase] : []),
    ...(!spec.elimination && eliminationPhase ? [eliminationPhase] : []),
  ];

  // Ce que la manœuvre coûterait. Les pronostics déposés sur une affiche qui
  // disparaît sont comptés séparément des résultats officiels : perdre le
  // travail d'un joueur et perdre une saisie d'organisateur ne se pèsent pas
  // pareil.
  const predictedOnDeleted = toDelete.length
    ? await prisma.predictedBattle.count({
      where: {
        phaseId: bracket.id,
        OR: toDelete.map((b) => ({ round: b.round, slot: b.slot })),
      },
    })
    : 0;

  const impact = {
    battlesAdded: toCreate.length,
    battlesRemoved: toDelete.length,
    playedRemoved: toDelete.filter((b) => b.played).length,
    predictedBattlesLost: predictedOnDeleted,
    phasesRemoved: phasesToDelete.map((p) => ({
      id: p.id,
      name: p.name,
      predictedRanks: p._count.predictedRanks,
      results: p._count.entries,
    })),
  };

  const destroys =
    impact.playedRemoved > 0 ||
    impact.predictedBattlesLost > 0 ||
    phasesToDelete.some((p) => p._count.predictedRanks > 0 || p._count.entries > 0);

  if (destroys && !spec.force) {
    return res.status(409).json({
      error:
        `Ce changement supprimerait ${impact.battlesRemoved} affiche(s) — dont ` +
        `${impact.playedRemoved} déjà jouée(s) — et ${impact.predictedBattlesLost} ` +
        `choix de pronostiqueurs. Confirmez pour continuer.`,
      impact,
    });
  }

  // Le tirage est exprimé en RANGS pour une taille de tableau donnée : changer
  // de taille le rend illisible. Mieux vaut le vider que le laisser désigner des
  // rangs qui n'existent plus.
  const MAIN = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];
  const currentFirst = MAIN.find((r) => bracket.battles.some((b) => b.round === r));
  const currentSize = currentFirst
    ? bracket.battles.filter((b) => b.round === currentFirst).length * 2
    : 0;
  const sizeChanged = currentSize !== shape.size;

  await prisma.$transaction(async (tx) => {
    if (toDelete.length) {
      await tx.battle.deleteMany({ where: { id: { in: toDelete.map((b) => b.id) } } });
      // Les pronostics d'affiche ne pointent pas la Battle mais son couple
      // (tour, slot) : rien ne les emporte en cascade, il faut les balayer à la
      // main sous peine de laisser des choix sur des affiches inexistantes.
      await tx.predictedBattle.deleteMany({
        where: {
          phaseId: bracket.id,
          OR: toDelete.map((b) => ({ round: b.round, slot: b.slot })),
        },
      });
    }

    if (toCreate.length) await tx.battle.createMany({ data: toCreate });

    if (phasesToDelete.length) {
      await tx.phase.deleteMany({ where: { id: { in: phasesToDelete.map((p) => p.id) } } });
    }

    // Les paliers de qualification, dans l'ordre : wildcards puis éliminations.
    let position = 0;
    if (spec.wildcard) {
      const count = spec.wildcardCount ?? shape.size * 2;
      if (wildcardPhase) {
        await tx.phase.update({
          where: { id: wildcardPhase.id },
          data: { qualifierCount: count, position: position++ },
        });
      } else {
        await tx.phase.create({
          data: {
            categoryId: category.id,
            name: 'Wildcards',
            type: 'WILDCARD',
            position: position++,
            qualifierCount: count,
          },
        });
      }
    }
    if (spec.elimination) {
      const count = spec.eliminationCount ?? shape.size;
      if (eliminationPhase) {
        await tx.phase.update({
          where: { id: eliminationPhase.id },
          data: { qualifierCount: count, position: position++ },
        });
      } else {
        await tx.phase.create({
          data: {
            categoryId: category.id,
            name: 'Éliminations',
            type: 'ELIMINATION',
            position: position++,
            qualifierCount: count,
          },
        });
      }
    }

    await tx.phase.update({
      where: { id: bracket.id },
      data: {
        name: `Tableau — ${shape.label}`,
        position: position++,
        ...(sizeChanged ? { seedPairs: null } : {}),
      },
    });
  });

  // Une petite finale ajoutée après coup : les joueurs ont déposé un tableau qui
  // n'en avait pas, et beaucoup ne repasseront jamais. Leur affiche se DÉDUIT
  // pourtant de leurs propres demies — ce sont les perdants, personne n'invente
  // rien à leur place. On la compose donc, sans désigner de vainqueur : ce
  // choix-là leur appartient, et reste à faire tant que la phase est ouverte.
  const addedSmallFinal = toCreate.some((b) => b.round === 'SMALL_FINAL');
  const backfilled = addedSmallFinal ? await composeSmallFinals(bracket.id) : 0;

  const rescored = await rescoreCategory(category.id);

  res.json({ ok: true, impact, backfilled, rescored });
});

/**
 * Compose la petite finale de chaque pronostic à partir de ses demi-finales.
 *
 * Le vainqueur et le score sont remis à zéro : une affiche qui vient de changer
 * de composition ne peut pas garder un vainqueur désigné contre une autre.
 */
async function composeSmallFinals(phaseId) {
  const semis = await prisma.predictedBattle.findMany({
    where: { phaseId, round: 'SEMI' },
    orderBy: { slot: 'asc' },
  });

  const losers = new Map();
  for (const s of semis) {
    if (!s.winnerId || !s.contenderAId || !s.contenderBId) continue;
    const loser = s.winnerId === s.contenderAId ? s.contenderBId : s.contenderAId;
    if (!losers.has(s.predictionId)) losers.set(s.predictionId, []);
    losers.get(s.predictionId).push(loser);
  }

  let done = 0;
  for (const [predictionId, pair] of losers) {
    if (pair.length < 2) continue; // une seule demie tranchée : rien à opposer
    await prisma.predictedBattle.upsert({
      where: {
        predictionId_phaseId_round_slot: {
          predictionId,
          phaseId,
          round: 'SMALL_FINAL',
          slot: 0,
        },
      },
      update: {
        contenderAId: pair[0],
        contenderBId: pair[1],
        winnerId: null,
        scoreA: null,
        scoreB: null,
      },
      create: {
        predictionId,
        phaseId,
        round: 'SMALL_FINAL',
        slot: 0,
        contenderAId: pair[0],
        contenderBId: pair[1],
      },
    });
    done++;
  }
  return done;
}

/**
 * Le porte-monnaie d'un joueur, vu et alimenté par l'organisateur.
 *
 * ─── Pourquoi une écriture et non un compteur ───────────────────────────────
 *
 * Créditer manuellement, c'est ajouter une LIGNE au livre de comptes, pas
 * augmenter un solde. Le solde reste ce qu'il a toujours été : la somme des
 * lignes. Conséquence directe, et c'est tout l'intérêt — une bourse donnée par
 * erreur se retire en supprimant sa ligne, sans qu'on ait à retrancher quoi que
 * ce soit ni à se demander si un achat est passé entre-temps.
 *
 * ─── Pourquoi une provenance ────────────────────────────────────────────────
 *
 * Un crédit d'événement se justifie tout seul : il porte l'identifiant de la
 * compète. Un crédit manuel ne porte rien. Le jour où quelqu'un demande d'où
 * viennent ses cinq cents points, sans `note` ni `grantedById` la seule réponse
 * possible est « je ne sais pas ». Les deux colonnes coûtent une migration et
 * évitent cette conversation.
 */

const WALLET_NOTE_MAX = 140;

/** Le solde et les dernières écritures d'un joueur. */
adminRouter.get('/users/:id/wallet', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true, globalName: true },
  });
  if (!user) return res.status(404).json({ error: 'Compte introuvable.' });

  const [agg, entries] = await Promise.all([
    prisma.walletEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
    prisma.walletEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      // Vingt lignes : de quoi comprendre un solde sans transformer le panneau
      // en relevé bancaire. Le livre complet reste dans l'export de compte.
      take: 20,
      include: { event: { select: { slug: true, name: true, year: true } } },
    }),
  ]);

  res.json({
    user,
    balance: agg._sum.amount ?? 0,
    entries,
  });
});

/**
 * Créditer ou débiter à la main.
 *
 * Le montant peut être négatif : reprendre une bourse donnée par erreur est le
 * cas d'usage jumeau, et une route séparée pour ça n'aurait rien apporté.
 *
 * Un débit ne peut pas faire passer le solde sous zéro. La boutique suppose
 * partout un solde positif ; un porte-monnaie négatif ne bloquerait pas
 * seulement les achats, il ferait aussi disparaître silencieusement les crédits
 * de la compète suivante, absorbés par le trou.
 */
adminRouter.post('/users/:id/wallet', async (req, res) => {
  const { amount, note } = z
    .object({
      amount: z.number().int().refine((n) => n !== 0, 'Un mouvement de zéro point ne dit rien.'),
      note: z.string().trim().min(1).max(WALLET_NOTE_MAX),
    })
    .parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!user) return res.status(404).json({ error: 'Compte introuvable.' });

  // Transaction interactive : le solde est lu ET la ligne écrite sans que rien
  // ne s'intercale. Deux onglets d'administration ouverts sur le même joueur,
  // et deux débits de cent points passeraient tous les deux sur un solde de
  // cent cinquante.
  try {
    await prisma.$transaction(async (tx) => {
      const agg = await tx.walletEntry.aggregate({
        where: { userId: user.id },
        _sum: { amount: true },
      });
      const balance = agg._sum.amount ?? 0;
      if (balance + amount < 0) {
        const err = new Error('negative');
        err.balance = balance;
        throw err;
      }

      await tx.walletEntry.create({
        data: {
          userId: user.id,
          kind: 'GRANT',
          amount,
          note,
          grantedById: req.user.id,
        },
      });
    });
  } catch (err) {
    if (err.message === 'negative') {
      return res.status(409).json({
        error: `Ce retrait mettrait le porte-monnaie à découvert : il contient ${err.balance} point(s).`,
      });
    }
    throw err;
  }

  const agg = await prisma.walletEntry.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  res.json({ ok: true, balance: agg._sum.amount ?? 0 });
});

/**
 * Annuler une écriture manuelle.
 *
 * Seules les lignes GRANT sont supprimables. Un crédit d'événement se corrige en
 * re-clôturant la compète — c'est ce qui garde le calcul et le livre d'accord.
 * Et un achat ne se défait pas ici : supprimer sa ligne rendrait les points tout
 * en laissant l'objet équipé.
 */
adminRouter.delete('/wallet/:entryId', async (req, res) => {
  const entry = await prisma.walletEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, kind: true, userId: true },
  });
  if (!entry) return res.status(404).json({ error: 'Écriture introuvable.' });
  if (entry.kind !== 'GRANT') {
    return res.status(400).json({
      error: "Seules les écritures manuelles s'annulent ici. Un crédit d'événement se corrige en re-clôturant la compète.",
    });
  }

  await prisma.walletEntry.delete({ where: { id: entry.id } });

  const agg = await prisma.walletEntry.aggregate({
    where: { userId: entry.userId },
    _sum: { amount: true },
  });
  res.json({ ok: true, balance: agg._sum.amount ?? 0 });
});

adminRouter.patch('/categories/:id', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    position: z.number().int().optional(),
    /**
     * Les juges, en clair.
     *
     * Des chaînes et non des relations vers `Artist` : un jury comprend
     * régulièrement des gens qui ne concourent nulle part — des beatboxers
     * retirés, des invités d'une autre discipline. Les faire entrer au
     * référentiel des artistes pour les citer une fois polluerait la page
     * Artistes et fausserait ses statistiques.
     *
     * Bornes : seize noms de soixante caractères. Un jury plus grand que ça
     * n'existe pas, et sans limite le champ devient un presse-papier.
     */
    judges: z.array(z.string().trim().min(1).max(60)).max(16).optional(),
  });
  const data = schema.parse(req.body);
  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: { ...data, ...(data.name ? { slug: slugify(data.name) } : {}) },
  });
  res.json({ category });
});

adminRouter.delete('/categories/:id', onlyAdmin, async (req, res) => {
  const impact = await categoryImpact(req.params.id);
  if (!impact) return res.status(404).json({ error: 'Catégorie introuvable.' });

  const hasImpact = impact.predictions > 0 || impact.contenders > 0;
  if (hasImpact && req.query.confirm !== 'true') {
    return res.status(409).json({
      error: `Cette catégorie porte ${impact.contenders} participant(s) et ${impact.predictions} pronostic(s). Confirmez pour continuer.`,
      impact,
    });
  }

  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true, impact });
});

adminRouter.delete('/phases/:id', onlyAdmin, async (req, res) => {
  await prisma.phase.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// --- Saisie des résultats -----------------------------------------------------

/** Classement officiel d'une phase. Résout la phase et relance le scoring. */
/**
 * Le score maximal atteignable sur un événement, phase par phase.
 *
 * Un contrôle avant ouverture : si le total ne correspond pas à ce qu'on
 * attend, c'est que la structure est mal montée. Le maximum ne dépend que de
 * la structure, pas des résultats — il est donc connu dès la création.
 */
adminRouter.get('/events/:eventId/max-score', async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.eventId },
    include: {
      categories: {
        orderBy: { position: 'asc' },
        include: {
          contenders: { select: { id: true } },
          phases: {
            orderBy: { position: 'asc' },
            // `round` en plus de l'identifiant : le barème du top 4 dépend de la
            // PRÉSENCE d'une finale et d'une petite finale, pas du nombre
            // d'affiches. Sans cette colonne, maxScoreForCategory ne voyait que
            // des tours `undefined` et n'annonçait jamais ces points.
            include: { battles: { select: { id: true, round: true } } },
          },
        },
      },
    },
  });
  if (!event) return res.status(404).json({ error: 'Événement introuvable.' });

  res.json(maxScoreForEvent(event));
});

/**
 * Le tirage du premier tour d'un tableau.
 *
 * Renvoie aussi de quoi le composer : le tour concerné, le nombre d'affiches,
 * et les modèles courants déjà calculés à la bonne taille. L'interface n'a donc
 * aucune de ces constantes à redire de son côté.
 */
adminRouter.get('/phases/:id/seeding', async (req, res) => {
  const phase = await prisma.phase.findUnique({
    where: { id: req.params.id },
    include: { battles: true },
  });
  if (!phase) return res.status(404).json({ error: 'Phase introuvable.' });

  const { round, count } = firstRoundOf(phase.battles);
  const size = count * 2;

  res.json({
    round,
    battles: count,
    size,
    seedPairs: phase.seedPairs ?? null,
    patterns: {
      standard: patternFor('standard', size),
      halves: patternFor('halves', size),
      adjacent: patternFor('adjacent', size),
    },
  });
});

/**
 * Enregistre le tirage, puis reconvertit les pronostics déjà déposés.
 *
 * Le recalcul n'est pas optionnel. Le score apparie les affiches par couple de
 * participants : un pronostic laissé sous l'ancien tirage ne correspondrait à
 * aucune affiche officielle et ne rapporterait rien, alors que la personne
 * avait rempli correctement ce qu'on lui demandait. Changer le format sans
 * reconvertir, c'est faire payer aux joueurs une décision d'organisateur.
 */
adminRouter.put('/phases/:id/seeding', async (req, res) => {
  const { seedPairs, pattern } = z
    .object({
      seedPairs: z.array(z.array(z.number().int().nullable()).length(2)).nullable().optional(),
      pattern: z.enum(['standard', 'halves', 'adjacent']).nullable().optional(),
    })
    .parse(req.body);

  const phase = await prisma.phase.findUnique({
    where: { id: req.params.id },
    include: { battles: true },
  });
  if (!phase) return res.status(404).json({ error: 'Phase introuvable.' });
  if (!['BRACKET', 'LEGACY'].includes(phase.type)) {
    return res.status(400).json({ error: "Un tirage ne concerne qu'un tableau." });
  }

  const { count } = firstRoundOf(phase.battles);
  if (count === 0) {
    return res.status(400).json({ error: "Ce tableau n'a pas encore d'affiches." });
  }

  // Un modèle nommé l'emporte sur une liste : c'est le geste le plus courant,
  // et il évite à l'interface de recalculer ce que le serveur sait déjà faire.
  const wanted = pattern ? patternFor(pattern, count * 2) : seedPairs ?? null;

  const check = validateSeedPairs(wanted, count);
  if (!check.ok) return res.status(400).json({ error: check.error });

  await prisma.phase.update({
    where: { id: phase.id },
    data: { seedPairs: check.pairs },
  });

  const converted = await reresolvePhase(phase.id);

  // Les points suivent : une affiche qui change de participants change de
  // résultat. Ne rescorer que si la catégorie a déjà été scorée une fois.
  const scored = await prisma.prediction.count({
    where: { categoryId: phase.categoryId, scoredAt: { not: null } },
  });
  if (scored > 0) await rescoreCategory(phase.categoryId);

  res.json({ phase: { id: phase.id, seedPairs: check.pairs }, converted, rescored: scored > 0 });
});

/** Change le nombre de qualifiés d'une phase après coup. */
adminRouter.patch('/phases/:id/qualifiers', async (req, res) => {
  const { qualifierCount } = z
    // Une place au minimum, cent au plus — les mêmes bornes qu'à la
    // composition. Une sélection n'a pas de raison d'être une puissance de deux.
    .object({ qualifierCount: z.number().int().min(MIN_PLACES).max(MAX_PLACES).nullable() })
    .parse(req.body);

  const phase = await prisma.phase.update({
    where: { id: req.params.id },
    data: { qualifierCount },
  });

  // Les qualifications déjà saisies suivent la nouvelle coupe : laisser
  // l'ancienne répartition afficherait une ligne de qualification qui ne
  // correspond plus au réglage.
  if (qualifierCount) {
    const entries = await prisma.phaseEntry.findMany({ where: { phaseId: phase.id } });
    await prisma.$transaction(
      entries.map((e) =>
        prisma.phaseEntry.update({
          where: { id: e.id },
          data: { qualified: e.rank <= qualifierCount },
        })
      )
    );
  }

  // La coupe décide qui entre au tableau : la déplacer change le premier tour
  // aussi sûrement que réordonner le classement.
  const reseed = await reseedOfficialBracket(phase.categoryId);
  if (reseed.phases > 0) await rescoreCategory(phase.categoryId);

  res.json({ phase, reseed });
});

adminRouter.put('/phases/:phaseId/results', async (req, res) => {
  const schema = z.object({
    // Explicite, sans valeur par défaut : enregistrer des résultats ne les
    // publie pas. Une catégorie peut être saisie et gardée au chaud pendant
    // qu'une autre attend encore ses résultats.
    resolved: z.boolean(),
    entries: z.array(
      z.object({
        contenderId: z.string(),
        rank: z.number().int().min(1),
        qualified: z.boolean().default(false),
      })
    ),
  });
  const { entries, resolved } = schema.parse(req.body);

  await prisma.$transaction([
    prisma.phaseEntry.deleteMany({ where: { phaseId: req.params.phaseId } }),
    prisma.phaseEntry.createMany({
      data: entries.map((e) => ({ ...e, phaseId: req.params.phaseId })),
    }),
    prisma.phase.update({ where: { id: req.params.phaseId }, data: { resolved } }),
  ]);

  const phase = await prisma.phase.findUnique({ where: { id: req.params.phaseId } });

  // Le tableau suit le classement, publication ou non : on saisit ses
  // éliminations, on regarde le premier tour qui en découle, on corrige.
  const reseed = await reseedOfficialBracket(phase.categoryId);

  const count = await rescoreCategory(phase.categoryId);
  res.json({ ok: true, rescored: count, reseed });
});

/** Résultat d'une battle. */
adminRouter.put('/battles/:id/result', async (req, res) => {
  const schema = z.object({
    winnerId: z.string().nullable(),
    scoreA: z.number().int().min(0).max(5).nullable().optional(),
    scoreB: z.number().int().min(0).max(5).nullable().optional(),
    played: z.boolean().default(true),
    contenderAId: z.string().nullable().optional(),
    contenderBId: z.string().nullable().optional(),
  });
  const battle = await prisma.battle.update({
    where: { id: req.params.id },
    data: schema.parse(req.body),
    include: { phase: true },
  });
  const count = await rescoreCategory(battle.phase.categoryId);
  res.json({ battle, rescored: count });
});

/**
 * Publie toutes les affiches d'une phase en une fois. L'ancien enregistrement
 * battle par battle relançait le calcul de toute la catégorie à chaque clic :
 * huitièmes complets = 8 recalculs pour un seul résultat utile. Ici on écrit
 * tout, puis on recalcule une fois.
 */
adminRouter.put('/phases/:phaseId/battles', async (req, res) => {
  const schema = z.object({
    resolved: z.boolean().optional(),
    battles: z.array(
      z.object({
        id: z.string(),
        contenderAId: z.string().nullable().optional(),
        contenderBId: z.string().nullable().optional(),
        winnerId: z.string().nullable().optional(),
        scoreA: z.number().int().min(0).max(5).nullable().optional(),
        scoreB: z.number().int().min(0).max(5).nullable().optional(),
        played: z.boolean().optional(),
      })
    ),
  });
  const { battles, resolved } = schema.parse(req.body);

  const phase = await prisma.phase.findUnique({
    where: { id: req.params.phaseId },
    include: { battles: { select: { id: true } } },
  });
  if (!phase) return res.status(404).json({ error: 'Phase introuvable.' });

  // On n'écrit que dans les affiches qui appartiennent bien à cette phase.
  const mine = new Set(phase.battles.map((b) => b.id));
  const rejected = battles.filter((b) => !mine.has(b.id)).length;
  const todo = battles.filter((b) => mine.has(b.id));

  await prisma.$transaction([
    ...todo.map(({ id, ...data }) =>
      prisma.battle.update({
        where: { id },
        data: {
          ...data,
          // Une affiche est « jouée » dès qu'elle a un vainqueur, sauf mention
          // contraire explicite.
          played: data.played ?? Boolean(data.winnerId),
        },
      })
    ),
    ...(resolved === undefined
      ? []
      : [prisma.phase.update({ where: { id: phase.id }, data: { resolved } })]),
  ]);

  const count = await rescoreCategory(phase.categoryId);
  res.json({ ok: true, updated: todo.length, rejected, rescored: count });
});

/** Top 4 officiel d'une catégorie. */
adminRouter.put('/categories/:categoryId/podium', async (req, res) => {
  const schema = z.object({
    slots: z.array(z.object({ rank: z.number().int().min(1).max(4), contenderId: z.string() })),
  });
  const { slots } = schema.parse(req.body);

  await prisma.$transaction([
    prisma.podiumSlot.deleteMany({ where: { categoryId: req.params.categoryId } }),
    prisma.podiumSlot.createMany({
      data: slots.map((s) => ({ ...s, categoryId: req.params.categoryId })),
    }),
  ]);

  const count = await rescoreCategory(req.params.categoryId);
  res.json({ ok: true, rescored: count });
});

adminRouter.post('/categories/:categoryId/rescore', async (req, res) => {
  const count = await rescoreCategory(req.params.categoryId);
  res.json({ ok: true, rescored: count });
});

adminRouter.post('/events/:eventId/rescore', async (req, res) => {
  const categories = await prisma.category.findMany({ where: { eventId: req.params.eventId } });
  let total = 0;
  for (const c of categories) total += await rescoreCategory(c.id);
  res.json({ ok: true, rescored: total });
});

// --- Rôles --------------------------------------------------------------------

// ===========================================================================
//  RECHERCHE
// ===========================================================================

/**
 * Retrouver un pronostic à partir de ce qu'on en sait.
 *
 * ─── À quoi ça sert ──────────────────────────────────────────────────────────
 *
 * Un joueur signale un incident, conteste un score, demande pourquoi tel
 * pronostic vaut tant. Répondre demandait jusqu'ici d'ouvrir une console psql
 * et d'écrire une jointure à cinq tables. Cet écran pose les mêmes questions
 * avec des filtres qui se cumulent.
 *
 * ─── Les brouillons ne sortent pas par défaut ────────────────────────────────
 *
 * Chacun peut garder dix brouillons par catégorie. Ils ne sont publics nulle
 * part, et leurs auteurs ne s'attendent pas à ce qu'on les lise — c'est une
 * différence de nature avec un pronostic déposé, public par construction. Les
 * inclure reste possible, mais demande un geste explicite : `drafts=1`. Le
 * défaut protège, l'option permet.
 *
 * ─── Pourquoi une seule requête ──────────────────────────────────────────────
 *
 * Tous les filtres se ramènent à des conditions sur `Prediction`, y compris
 * ceux qui portent sur son contenu : Prisma exprime « ce pronostic contient au
 * moins une ligne qui… » par un `some`, et ces `some` se cumulent naturellement
 * en ET. Aucun SQL à assembler à la main, donc aucune injection possible et
 * aucun cas particulier à maintenir quand on ajoute un filtre.
 */
adminRouter.get('/search/predictions', async (req, res, next) => {
  try {
    const q = req.query;
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const int = (v) => {
      const n = Number(v);
      return Number.isInteger(n) ? n : null;
    };

    const eventSlug = str(q.event);
    const categoryId = str(q.categoryId);
    const phaseId = str(q.phaseId);
    const subject = str(q.subject);      // fragment de nom : duo ou artiste
    const opponent = str(q.opponent);    // l'autre camp d'une affiche
    const player = str(q.player);
    const round = str(q.round);
    const rankMin = int(q.rankMin);
    const rankMax = int(q.rankMax);
    const wantsWinner = q.winner === '1';
    const drafts = q.drafts === '1';

    /**
     * Un fragment de nom vers des contenders.
     *
     * On cherche des deux côtés : le nom porté par le duo lui-même, et celui
     * des artistes qui lui sont rattachés. Un Tag Team peut n'avoir aucun nom
     * propre — la colonne est nullable exprès — et se désigner uniquement par
     * ses membres.
     */
    const contendersNamed = async (fragment) => {
      if (!fragment) return null;
      const found = await prisma.contender.findMany({
        where: {
          OR: [
            { name: { contains: fragment, mode: 'insensitive' } },
            { artists: { some: { artist: { name: { contains: fragment, mode: 'insensitive' } } } } },
          ],
          ...(categoryId ? { categoryId } : {}),
        },
        select: { id: true },
      });
      return found.map((c) => c.id);
    };

    const [subjectIds, opponentIds] = await Promise.all([
      contendersNamed(subject),
      contendersNamed(opponent),
    ]);

    // Un nom qui ne correspond à personne doit rendre zéro résultat, pas tous :
    // sans ce garde, une faute de frappe renverrait la base entière.
    if ((subject && subjectIds.length === 0) || (opponent && opponentIds.length === 0)) {
      return res.json({ rows: [], total: 0, capped: false });
    }

    // --- Les conditions sur le CONTENU du pronostic
    const conditions = [];

    if (subjectIds && (rankMin != null || rankMax != null || (!wantsWinner && !opponent))) {
      // Un nom sans autre précision se cherche d'abord dans les classements :
      // c'est la question la plus fréquente — « où l'a-t-on placé ? ».
      conditions.push({
        ranks: {
          some: {
            contenderId: { in: subjectIds },
            ...(phaseId ? { phaseId } : {}),
            ...(rankMin != null || rankMax != null
              ? {
                rank: {
                  ...(rankMin != null ? { gte: rankMin } : {}),
                  ...(rankMax != null ? { lte: rankMax } : {}),
                },
              }
              : {}),
          },
        },
      });
    }

    if (wantsWinner && subjectIds) {
      conditions.push({
        battles: {
          some: {
            winnerId: { in: subjectIds },
            ...(round ? { round } : {}),
            ...(phaseId ? { phaseId } : {}),
          },
        },
      });
    }

    if (opponentIds) {
      /**
       * L'affiche, cherchée sans tenir compte du côté.
       *
       * Qui a pronostiqué « A contre B » ? Le pronostiqueur a pu poser A en
       * haut ou en bas : exiger un ordre précis raterait la moitié des
       * réponses. On accepte donc les deux dispositions.
       */
      conditions.push({
        battles: {
          some: {
            OR: [
              { contenderAId: { in: subjectIds }, contenderBId: { in: opponentIds } },
              { contenderAId: { in: opponentIds }, contenderBId: { in: subjectIds } },
            ],
            ...(round ? { round } : {}),
            ...(phaseId ? { phaseId } : {}),
          },
        },
      });
    }

    // Un tour demandé sans autre critère de bracket : on cherche les pronostics
    // qui ont rempli ce tour, quel qu'en soit le contenu.
    if (round && !wantsWinner && !opponent) {
      conditions.push({ battles: { some: { round, ...(phaseId ? { phaseId } : {}) } } });
    }

    const where = {
      // Voir l'en-tête : les brouillons demandent un geste explicite.
      ...(drafts ? {} : { submitted: true }),
      ...(eventSlug ? { event: { slug: eventSlug } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(player
        ? {
          user: {
            OR: [
              { username: { contains: player, mode: 'insensitive' } },
              { globalName: { contains: player, mode: 'insensitive' } },
            ],
          },
        }
        : {}),
      ...(conditions.length ? { AND: conditions } : {}),
    };

    const TAKE = 200;

    const [total, predictions] = await Promise.all([
      prisma.prediction.count({ where }),
      prisma.prediction.findMany({
        where,
        orderBy: [{ submitted: 'desc' }, { updatedAt: 'desc' }],
        take: TAKE,
        select: {
          id: true,
          label: true,
          submitted: true,
          points: true,
          scoredAt: true,
          updatedAt: true,
          user: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
          event: { select: { slug: true, name: true, year: true } },
          category: { select: { name: true, kind: true } },
          // Les lignes qui ont DÉCLENCHÉ la correspondance, pour que chaque
          // résultat montre pourquoi il est là. Une liste de pseudos sans
          // justification obligerait à ouvrir chaque fiche pour comprendre.
          ranks: subjectIds
            ? {
              where: { contenderId: { in: subjectIds } },
              select: { rank: true, contenderId: true, phase: { select: { name: true } } },
              orderBy: { rank: 'asc' },
            }
            : false,
          battles: subjectIds && (wantsWinner || opponent)
            ? {
              where: {
                OR: [
                  { contenderAId: { in: subjectIds } },
                  { contenderBId: { in: subjectIds } },
                ],
                ...(round ? { round } : {}),
              },
              select: {
                round: true,
                contenderAId: true,
                contenderBId: true,
                winnerId: true,
                scoreA: true,
                scoreB: true,
              },
            }
            : false,
        },
      }),
    ]);

    // Les noms des contenders cités, pour que l'écran affiche « D-low » plutôt
    // qu'un identifiant. Une seule requête pour tous les résultats.
    const cited = new Set();
    for (const p of predictions) {
      for (const b of p.battles ?? []) {
        if (b.contenderAId) cited.add(b.contenderAId);
        if (b.contenderBId) cited.add(b.contenderBId);
      }
      for (const r of p.ranks ?? []) cited.add(r.contenderId);
    }

    const names = cited.size
      ? await prisma.contender.findMany({
        where: { id: { in: [...cited] } },
        select: {
          id: true,
          name: true,
          artists: { select: { artist: { select: { name: true } } } },
        },
      })
      : [];

    const nameOf = new Map(
      names.map((c) => [c.id, c.name ?? c.artists.map((a) => a.artist.name).join(' + ')])
    );

    res.json({
      total,
      capped: total > predictions.length,
      rows: predictions.map((p) => ({
        id: p.id,
        label: p.label,
        submitted: p.submitted,
        points: p.points,
        scored: Boolean(p.scoredAt),
        updatedAt: p.updatedAt,
        user: p.user,
        event: p.event,
        category: p.category,
        ranks: (p.ranks || []).map((r) => ({
          rank: r.rank,
          phase: r.phase?.name ?? null,
          name: nameOf.get(r.contenderId) ?? '—',
        })),
        battles: (p.battles || []).map((b) => ({
          round: b.round,
          a: nameOf.get(b.contenderAId) ?? '—',
          b: nameOf.get(b.contenderBId) ?? '—',
          winner: b.winnerId ? nameOf.get(b.winnerId) ?? '—' : null,
          score: b.scoreA == null ? null : `${b.scoreA}\u2013${b.scoreB}`,
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const where = q
    ? {
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        // Le nom d'affichage était absent de la recherche : quelqu'un qui a
        // changé de pseudo Discord restait introuvable sous le nom que tout le
        // monde lui connaît.
        { globalName: { contains: q, mode: 'insensitive' } },
        { discordId: q },
      ],
    }
    : {};

  // Trois nombres, pas un. `total` est l'effectif du site ; `matching` ce que
  // la recherche a trouvé ; la longueur de `users` ce qui est réellement rendu.
  // Sans les deux premiers, une liste plafonnée à cent lignes se lisait comme
  // « le site compte cent comptes ».
  const [total, matching, users] = await Promise.all([
    prisma.user.count(),
    q ? prisma.user.count({ where }) : prisma.user.count(),
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true, discordId: true, username: true, globalName: true,
        avatarUrl: true, role: true, createdAt: true, lastSeenAt: true,
        // L'état de bannissement voyage avec le compte : la liste doit pouvoir
        // marquer la ligne sans une seconde requête par personne.
        bannedAt: true, banReason: true,
      },
    }),
  ]);

  res.json({ users, total, matching, capped: matching > users.length });
});

/**
 * La courbe des arrivées et de la fréquentation.
 *
 * Deux séries sur la même grille de journées : les comptes créés ce jour-là, et
 * les personnes qui se sont manifestées. Séparées, elles ne diraient pas
 * grand-chose ; côte à côte elles répondent à la seule question qui compte
 * après une annonce — les nouveaux venus sont-ils restés ?
 *
 * La journée est locale, comme partout ailleurs sur le site : un découpage UTC
 * ferait basculer le compteur à 2 h du matin l'été, en plein pic d'activité un
 * soir de compète.
 */
adminRouter.get('/users/activity', async (req, res) => {
  // Bornes serrées : sous une semaine la courbe n'a pas de forme, au-delà de
  // six mois elle ne tient plus dans la largeur d'un écran.
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 180);
  const window = lastDays(days);

  // On remonte un jour plus tôt en UTC que la première journée locale : selon
  // le fuseau, une inscription du 1er à 00 h 30 locale porte un horodatage UTC
  // de la veille, et serait perdue par une comparaison naïve.
  const since = new Date(`${window[0]}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 1);

  const [created, visits] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    // Visit.day est déjà une journée locale : une simple comparaison de chaînes
    // ISO suffit, l'ordre lexicographique étant chronologique.
    prisma.visit.groupBy({
      by: ['day'],
      where: { day: { gte: window[0] } },
      _count: { _all: true },
    }),
  ]);

  const signupsByDay = new Map();
  for (const u of created) {
    const day = localDay(u.createdAt);
    signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
  }
  const activeByDay = new Map(visits.map((v) => [v.day, v._count._all]));

  res.json({
    days: window.map((day) => ({
      day,
      signups: signupsByDay.get(day) ?? 0,
      active: activeByDay.get(day) ?? 0,
    })),
  });
});

/**
 * Changement de rôle.
 *
 * La hiérarchie tient en trois règles :
 *   — un administrateur gère les membres et les autres administrateurs ;
 *   — il ne peut ni toucher au propriétaire, ni s'auto-promouvoir propriétaire ;
 *   — seul le propriétaire transmet son rang, et il ne peut pas se le retirer
 *     sans le donner à quelqu'un d'autre. Le site garde toujours un propriétaire.
 */
adminRouter.patch('/users/:id/role', onlyAdmin, async (req, res) => {
  const { role } = z.object({ role: z.enum(['USER', 'ADMIN', 'OWNER']) }).parse(req.body);

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true, role: true },
  });
  if (!target) return res.status(404).json({ error: 'Compte introuvable.' });

  const actorIsOwner = req.user.role === 'OWNER';

  if (target.role === 'OWNER' && !actorIsOwner) {
    return res.status(403).json({
      error: 'Le propriétaire du site ne peut pas être rétrogradé par un administrateur.',
    });
  }
  if (role === 'OWNER' && !actorIsOwner) {
    return res.status(403).json({ error: 'Seul le propriétaire peut transmettre ce rang.' });
  }
  if (target.id === req.user.id && actorIsOwner && role !== 'OWNER') {
    return res.status(400).json({
      error: 'Transmettez d’abord la propriété à quelqu’un d’autre : le site doit toujours avoir un propriétaire.',
    });
  }
  if (target.id === req.user.id && role === 'USER') {
    return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits.' });
  }

  // La propriété se transmet : l'ancien propriétaire redevient administrateur.
  const user = await prisma.$transaction(async (tx) => {
    if (role === 'OWNER') {
      await tx.user.updateMany({ where: { role: 'OWNER' }, data: { role: 'ADMIN' } });
    }
    return tx.user.update({
      where: { id: target.id },
      data: { role },
      select: { id: true, username: true, role: true },
    });
  });

  res.json({ user });
});

/**
 * Les deux garde-fous communs au bannissement et à la suppression.
 *
 * Les mêmes que pour le changement de rôle, et pour les mêmes raisons : on ne
 * se les applique pas à soi-même — un administrateur qui se bannit ne peut plus
 * se débannir — et le propriétaire du site est hors d'atteinte d'un
 * administrateur. Sans cette dernière règle, n'importe quel administrateur
 * prendrait le site en fermant le compte au-dessus de lui.
 */
async function targetForSanction(req, res) {
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, username: true, globalName: true, discordId: true,
      role: true, bannedAt: true, banReason: true,
    },
  });
  if (!target) {
    res.status(404).json({ error: 'Compte introuvable.' });
    return null;
  }
  if (target.id === req.user.id) {
    res.status(400).json({ error: 'Vous ne pouvez pas appliquer cette mesure à votre propre compte.' });
    return null;
  }
  if (target.role === 'OWNER') {
    res.status(403).json({
      error: 'Le propriétaire du site ne peut être ni banni ni supprimé. Transmettez d’abord le rôle.',
    });
    return null;
  }
  return target;
}

/**
 * Bannir un compte, ou lever le bannissement.
 *
 * ─── Ce que ça fait, et ce que ça ne fait pas ───────────────────────────────
 *
 * Ça ferme la porte : `attachUser` refuse la session, `auth.js` refuse la
 * connexion Discord. Rien d'autre ne bouge.
 *
 * Les pronostics déposés RESTENT au classement. C'est délibéré : les retirer
 * réécrirait le palmarès de tous les autres joueurs de l'événement, qui n'ont
 * rien fait — un score gagné contre trente personnes ne se recalcule pas parce
 * que l'une d'elles s'est mal tenue. Pour tout retirer, c'est la suppression
 * qu'il faut, et elle est en dessous.
 *
 * Réversible, et c'est la raison d'être de la mesure : la sanction proportionnée
 * à un incident est celle qu'on peut lever quand il est réglé. Sans elle, la
 * seule réponse disponible était de supprimer un compte pour de bon.
 *
 * Le motif est obligatoire à la pose. Sans lui, la seule réponse possible à
 * « pourquoi mon compte est fermé ? » six mois plus tard est « je ne sais
 * plus », et c'est une conversation qu'on n'a qu'une fois avant de le
 * regretter. Il ne sort jamais vers l'intéressé : la page de connexion dit que
 * c'est fermé, pas pourquoi.
 */
adminRouter.patch('/users/:id/ban', onlyAdmin, async (req, res) => {
  const { banned, reason } = z
    .object({ banned: z.boolean(), reason: z.string().max(280).optional() })
    .parse(req.body ?? {});

  const target = await targetForSanction(req, res);
  if (!target) return undefined;

  if (banned && !(reason ?? '').trim()) {
    return res.status(400).json({ error: 'Indiquez un motif : il devra être relu plus tard.' });
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: banned
      ? { bannedAt: new Date(), banReason: reason.trim() }
      : { bannedAt: null, banReason: null },
    select: { id: true, username: true, bannedAt: true, banReason: true },
  });

  console.log(
    `[comptes] ${banned ? 'bannissement' : 'levée'} de ${target.username} (${target.discordId})` +
    ` par ${req.user.username}${banned ? ` — ${reason.trim()}` : ''}.`
  );

  return res.json({ user });
});

/**
 * Supprimer un compte.
 *
 * Le pendant administratif de la suppression volontaire, et la MÊME procédure :
 * `deleteAccount` transmet les groupes possédés au plus ancien membre restant
 * avant de laisser la cascade emporter le reste. Deux implémentations auraient
 * divergé, et la divergence se serait vue sur un groupe laissé sans
 * propriétaire — que rien dans l'application ne permet de réparer.
 *
 * `?confirm=true` obligatoire, comme pour toute suppression de cet écran : les
 * routes et l'interface tiennent la même ligne, et un appel direct à l'API ne
 * doit pas être plus permissif qu'un clic.
 *
 * Irréversible, et ça retire les pronostics du classement. Quand ce n'est pas
 * ce qu'on veut — et la plupart du temps ce n'est pas ce qu'on veut — c'est
 * `PATCH /users/:id/ban` qu'il faut appeler.
 */
adminRouter.delete('/users/:id', onlyAdmin, async (req, res) => {
  const target = await targetForSanction(req, res);
  if (!target) return undefined;

  if (req.query.confirm !== 'true') {
    return res.status(409).json({
      error: `La suppression de ${target.globalName ?? target.username} est définitive et retire ses pronostics du classement. Confirmez pour continuer.`,
    });
  }

  await deleteAccount(target.id);
  console.log(
    `[comptes] suppression de ${target.username} (${target.discordId}) par ${req.user.username}.`
  );

  return res.json({ ok: true, username: target.globalName ?? target.username });
});

// --- Recalcul -----------------------------------------------------------------

export async function rescoreCategory(categoryId) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      phases: { include: { entries: true, battles: true } },
    },
  });
  if (!category) return 0;

  category.podium = await prisma.podiumSlot.findMany({ where: { categoryId } });

  /**
   * Y a-t-il seulement quelque chose à scorer ?
   *
   * `scoredAt` disait « ce pronostic a été confronté aux résultats ». Il était
   * posé à CHAQUE recalcul, y compris quand rien n'avait encore été publié :
   * changer un nombre de qualifiés ou un tirage suffisait à marquer « scoré »
   * tous les pronostics de la catégorie, avec zéro point puisqu'il n'y avait
   * rien à comparer.
   *
   * D'où deux joueurs du même événement affichant des états différents : celui
   * qui avait déposé avant une manipulation d'organisateur passait pour scoré,
   * l'autre restait en attente. La différence ne disait rien de leurs
   * pronostics, seulement du moment où ils avaient cliqué.
   */
  const hasResults =
    category.phases.some((p) => p.resolved) || category.podium.length > 0;

  const predictions = await prisma.prediction.findMany({
    where: { categoryId, submitted: true },
    include: { ranks: true, battles: true, podium: true },
  });

  let updated = 0;
  for (const prediction of predictions) {
    const { total, sections } = scorePrediction(prediction, category);
    await prisma.prediction.update({
      where: { id: prediction.id },
      data: {
        points: total,
        breakdown: sections,
        // Remis à null quand il n'y a rien de publié : un recalcul doit pouvoir
        // corriger un marquage abusif, pas seulement éviter d'en poser un neuf.
        scoredAt: hasResults ? new Date() : null,
      },
    });
    updated += 1;
  }
  return updated;
}