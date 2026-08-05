import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

export const predictionRouter = Router();
predictionRouter.use(requireAuth);

const payloadSchema = z.object({
  submit: z.boolean().default(false),
  ranks: z
    .array(z.object({ phaseId: z.string(), contenderId: z.string(), rank: z.number().int().min(1) }))
    .default([]),
  battles: z
    .array(
      z.object({
        phaseId: z.string(),
        round: z.enum(['ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY']),
        slot: z.number().int().min(0),
        contenderAId: z.string().nullable().optional(),
        contenderBId: z.string().nullable().optional(),
        winnerId: z.string().nullable().optional(),
        scoreA: z.number().int().min(0).max(5).nullable().optional(),
        scoreB: z.number().int().min(0).max(5).nullable().optional(),
      })
    )
    .default([]),
  podium: z
    .array(z.object({ rank: z.number().int().min(1).max(4), contenderId: z.string() }))
    .max(4)
    .default([]),
});

/** Une phase est fermée dès qu'elle est résolue ou que sa date de fermeture est passée. */
function phaseIsLocked(phase) {
  if (phase.resolved) return true;
  return Boolean(phase.locksAt && new Date(phase.locksAt) <= new Date());
}

predictionRouter.put('/categories/:categoryId', async (req, res) => {
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Pronostic mal formé.', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const category = await prisma.category.findUnique({
    where: { id: req.params.categoryId },
    include: { event: true, phases: true, contenders: { select: { id: true } } },
  });
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable.' });
  if (category.event.status === 'DRAFT') {
    return res.status(403).json({ error: "Cet événement n'est pas encore ouvert." });
  }
  if (category.event.status === 'FINISHED') {
    return res.status(409).json({ error: 'Cet événement est terminé, les pronostics sont clos.' });
  }

  const validContenders = new Set(category.contenders.map((c) => c.id));
  const openPhases = new Map(
    category.phases.filter((p) => !phaseIsLocked(p)).map((p) => [p.id, p])
  );

  const keepRank = (r) => openPhases.has(r.phaseId) && validContenders.has(r.contenderId);
  const keepBattle = (b) =>
    openPhases.has(b.phaseId) &&
    (!b.contenderAId || validContenders.has(b.contenderAId)) &&
    (!b.contenderBId || validContenders.has(b.contenderBId)) &&
    (!b.winnerId || [b.contenderAId, b.contenderBId].includes(b.winnerId));

  const ranks = body.ranks.filter(keepRank);
  const battles = body.battles.filter(keepBattle);
  const podium = body.podium.filter((p) => validContenders.has(p.contenderId));

  const rejected =
    body.ranks.length - ranks.length + (body.battles.length - battles.length);

  const prediction = await prisma.$transaction(async (tx) => {
    const record = await tx.prediction.upsert({
      where: { userId_categoryId: { userId: req.user.id, categoryId: category.id } },
      create: {
        userId: req.user.id,
        eventId: category.eventId,
        categoryId: category.id,
        submitted: body.submit,
      },
      update: { submitted: body.submit || undefined },
    });

    // On ne réécrit que les phases encore ouvertes : les phases verrouillées
    // gardent le pronostic déposé avant la fermeture.
    const openIds = [...openPhases.keys()];
    await tx.predictedRank.deleteMany({ where: { predictionId: record.id, phaseId: { in: openIds } } });
    await tx.predictedBattle.deleteMany({ where: { predictionId: record.id, phaseId: { in: openIds } } });
    await tx.predictedPodium.deleteMany({ where: { predictionId: record.id } });

    if (ranks.length) {
      await tx.predictedRank.createMany({
        data: ranks.map((r) => ({ ...r, predictionId: record.id })),
      });
    }
    if (battles.length) {
      await tx.predictedBattle.createMany({
        data: battles.map((b) => ({
          predictionId: record.id,
          phaseId: b.phaseId,
          round: b.round,
          slot: b.slot,
          contenderAId: b.contenderAId ?? null,
          contenderBId: b.contenderBId ?? null,
          winnerId: b.winnerId ?? null,
          scoreA: b.scoreA ?? null,
          scoreB: b.scoreB ?? null,
        })),
      });
    }
    if (podium.length) {
      await tx.predictedPodium.createMany({
        data: podium.map((p) => ({ ...p, predictionId: record.id })),
      });
    }

    return tx.prediction.findUnique({
      where: { id: record.id },
      include: { ranks: true, battles: true, podium: true },
    });
  });

  res.json({
    prediction,
    note: rejected
      ? `${rejected} choix ont été ignorés : ces phases sont déjà fermées.`
      : null,
  });
});

predictionRouter.get('/mine', async (req, res) => {
  const predictions = await prisma.prediction.findMany({
    where: { userId: req.user.id },
    include: {
      event: { select: { slug: true, name: true, year: true, status: true } },
      category: { select: { name: true, slug: true, kind: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ predictions });
});
