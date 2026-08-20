import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { contenderName, withName } from '../lib/naming.js';
import { maxScoreForEvent } from '../lib/maxscore.js';
import { scorePrediction } from '../lib/scoring.js';
import {
  validateSeedPairs,
  patternFor,
  reresolvePhase,
  firstRoundOf,
  reseedOfficialBracket,
} from '../lib/seeding.js';

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

  const event = await prisma.event.update({ where: { id: req.params.id }, data });
  res.json({ event });
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
    round: z.enum(['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY']),
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
          format: z.enum(['TOP_16', 'TOP_8', 'TOP_4', 'TOP_2']).default('TOP_8'),
          // Deux paliers indépendants. Les wildcards passent en premier : c'est
          // la sélection sur vidéo, avant les éliminations sur scène.
          wildcard: z.boolean().default(false),
          wildcardCount: z.number().int().min(2).max(200).nullable().optional(),
          elimination: z.boolean().default(false),
          eliminationCount: z.number().int().min(2).max(200).nullable().optional(),
          smallFinal: z.boolean().default(false),
          legacyBattles: z.number().int().min(1).max(16).default(4),
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

adminRouter.patch('/categories/:id', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    position: z.number().int().optional(),
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
            include: { battles: { select: { id: true } } },
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
    .object({ qualifierCount: z.number().int().min(1).max(128).nullable() })
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

  /**
   * Le tableau suit le classement, publication ou non.
   *
   * C'est le geste attendu : on saisit ses éliminations, on regarde le premier
   * tour qui en découle, on corrige, on regarde à nouveau. Sans ce recalcul,
   * les affiches restaient celles du tout premier classement enregistré — et
   * pire, une affiche déjà pourvue d'un vainqueur faisait autorité et cessait
   * définitivement de bouger.
   *
   * Les vainqueurs déjà saisis survivent tant qu'ils figurent encore dans leur
   * affiche recomposée. Un qualifié qui sort du top perd les siens, ce qui est
   * la seule issue cohérente : il n'est plus censé avoir joué.
   */
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

adminRouter.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ username: { contains: q, mode: 'insensitive' } }, { discordId: q }] }
      : {},
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    take: 100,
    select: { id: true, discordId: true, username: true, globalName: true, avatarUrl: true, role: true, createdAt: true },
  });
  res.json({ users });
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