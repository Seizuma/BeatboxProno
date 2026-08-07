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