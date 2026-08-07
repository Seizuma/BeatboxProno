import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { scorePrediction } from '../lib/scoring.js';

export const adminRouter = Router();
adminRouter.use(requireRole('ADMIN', 'MODERATOR'));

const onlyAdmin = requireRole('ADMIN');
const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- Artistes -----------------------------------------------------------------

adminRouter.post('/artists', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    country: z.string().optional().nullable(),
    aliases: z.array(z.string()).default([]),
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

adminRouter.patch('/artists/:id', async (req, res) => {
  const artist = await prisma.artist.update({ where: { id: req.params.id }, data: req.body });
  res.json({ artist });
});

adminRouter.delete('/artists/:id', onlyAdmin, async (req, res) => {
  await prisma.artist.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
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
  });
  const data = schema.parse(req.body);
  const event = await prisma.event.create({
    data: { ...data, slug: slugify(`${data.name}-${data.year}`) },
  });
  res.status(201).json({ event });
});

adminRouter.patch('/events/:id', async (req, res) => {
  const event = await prisma.event.update({ where: { id: req.params.id }, data: req.body });
  res.json({ event });
});

adminRouter.delete('/events/:id', onlyAdmin, async (req, res) => {
  await prisma.event.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
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

adminRouter.post('/categories/:categoryId/contenders', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    seed: z.number().int().nullable().optional(),
    wildcard: z.boolean().default(false),
    artistIds: z.array(z.string()).default([]),
    imageUrl: z.string().url().nullable().optional(),
  });
  const { artistIds, ...data } = schema.parse(req.body);
  const contender = await prisma.contender.create({
    data: {
      ...data,
      categoryId: req.params.categoryId,
      artists: { create: artistIds.map((artistId) => ({ artistId })) },
    },
    include: { artists: { include: { artist: true } } },
  });
  res.status(201).json({ contender });
});

adminRouter.delete('/contenders/:id', async (req, res) => {
  await prisma.contender.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
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
          wildcard: z.boolean().default(false),
          wildcardCount: z.number().int().min(2).max(200).nullable().optional(),
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

      // Phase de qualification, si l'événement en a une.
      if (spec.wildcard) {
        await tx.phase.create({
          data: {
            categoryId: category.id,
            name: 'Wildcards',
            type: 'ELIMINATION',
            position: position++,
            qualifierCount: spec.wildcardCount ?? bracket.size,
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
  const count = await prisma.prediction.count({ where: { categoryId: req.params.id } });
  if (count > 0 && req.query.force !== 'true') {
    return res.status(409).json({
      error: `${count} pronostic(s) portent sur cette catégorie. Ajoutez ?force=true pour confirmer.`,
    });
  }
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

adminRouter.delete('/phases/:id', onlyAdmin, async (req, res) => {
  await prisma.phase.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// --- Saisie des résultats -----------------------------------------------------

/** Classement officiel d'une phase. Résout la phase et relance le scoring. */
adminRouter.put('/phases/:phaseId/results', async (req, res) => {
  const schema = z.object({
    resolved: z.boolean().default(true),
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
  const count = await rescoreCategory(phase.categoryId);
  res.json({ ok: true, rescored: count });
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

adminRouter.patch('/users/:id/role', onlyAdmin, async (req, res) => {
  const { role } = z.object({ role: z.enum(['USER', 'MODERATOR', 'ADMIN']) }).parse(req.body);
  if (req.params.id === req.user.id && role !== 'ADMIN') {
    return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle admin.' });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: { id: true, username: true, role: true },
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

  const predictions = await prisma.prediction.findMany({
    where: { categoryId, submitted: true },
    include: { ranks: true, battles: true, podium: true },
  });

  let updated = 0;
  for (const prediction of predictions) {
    const { total, sections } = scorePrediction(prediction, category);
    await prisma.prediction.update({
      where: { id: prediction.id },
      data: { points: total, breakdown: sections, scoredAt: new Date() },
    });
    updated += 1;
  }
  return updated;
}