import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

export const predictionRouter = Router();
predictionRouter.use(requireAuth);

/**
 * Un joueur garde jusqu'à dix versions par catégorie. Le plafond existe pour
 * que la page reste lisible et que personne ne remplisse la base à coups de
 * variantes ; au-delà, on demande d'en supprimer une plutôt que d'en écraser
 * une au hasard.
 */
const MAX_DRAFTS = 10;

const contentSchema = z.object({
  label: z.string().min(1).max(60).optional(),
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
        scoreA: z.number().int().min(0).max(9).nullable().optional(),
        scoreB: z.number().int().min(0).max(9).nullable().optional(),
      })
    )
    .default([]),
});

/** Une phase est fermée dès qu'elle est résolue ou que sa date de fermeture est passée. */
function phaseIsLocked(phase) {
  if (phase.resolved) return true;
  return Boolean(phase.locksAt && new Date(phase.locksAt) <= new Date());
}

/** L'événement accepte-t-il encore des pronostics ? */
function eventGate(event) {
  if (event.status === 'DRAFT') return "Cet événement n'est pas encore ouvert.";
  if (event.status === 'FINISHED') return 'Cet événement est terminé, les pronostics sont clos.';
  // Date butoir facultative : absente, seules les phases ferment.
  if (event.predictionsCloseAt && new Date(event.predictionsCloseAt) <= new Date()) {
    return 'La date limite des pronostics est passée.';
  }
  return null;
}

const withContent = { include: { ranks: true, battles: true } };

/** Charge un pronostic en vérifiant qu'il appartient bien à la personne. */
async function loadMine(predictionId, userId) {
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: {
      category: { include: { event: true, phases: true, contenders: { select: { id: true } } } },
    },
  });
  if (!prediction || prediction.userId !== userId) return null;
  return prediction;
}

// --- Lecture ------------------------------------------------------------------

/** Toutes mes versions pour une catégorie : brouillons et pronostic déposé. */
predictionRouter.get('/categories/:categoryId', async (req, res) => {
  const predictions = await prisma.prediction.findMany({
    where: { userId: req.user.id, categoryId: req.params.categoryId },
    orderBy: [{ submitted: 'desc' }, { updatedAt: 'desc' }],
    ...withContent,
  });
  res.json({ predictions, max: MAX_DRAFTS });
});

predictionRouter.get('/mine', async (req, res) => {
  const predictions = await prisma.prediction.findMany({
    where: { userId: req.user.id },
    include: {
      event: { select: { slug: true, name: true, year: true, status: true } },
      category: { select: { name: true, slug: true, kind: true } },
    },
    orderBy: [{ submitted: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json({ predictions });
});

// --- Création -----------------------------------------------------------------

/** Ouvre une nouvelle version. Peut recopier une version existante. */
predictionRouter.post('/categories/:categoryId', async (req, res) => {
  const { label, copyFrom } = z
    .object({ label: z.string().min(1).max(60).optional(), copyFrom: z.string().optional() })
    .parse(req.body ?? {});

  const category = await prisma.category.findUnique({
    where: { id: req.params.categoryId },
    include: { event: true },
  });
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable.' });

  const closed = eventGate(category.event);
  if (closed) return res.status(409).json({ error: closed });

  const drafts = await prisma.prediction.count({
    where: { userId: req.user.id, categoryId: category.id, submitted: false },
  });
  if (drafts >= MAX_DRAFTS) {
    return res.status(409).json({
      error: `Vous avez déjà ${MAX_DRAFTS} brouillons sur cette catégorie. Supprimez-en un pour en ouvrir un autre.`,
    });
  }

  // Recopie éventuelle : repartir d'une version existante plutôt que de zéro.
  let source = null;
  if (copyFrom) {
    source = await prisma.prediction.findUnique({
      where: { id: copyFrom },
      include: { ranks: true, battles: true },
    });
    if (!source || source.userId !== req.user.id || source.categoryId !== category.id) {
      return res.status(404).json({ error: 'Version à recopier introuvable.' });
    }
  }

  const prediction = await prisma.prediction.create({
    data: {
      userId: req.user.id,
      eventId: category.eventId,
      categoryId: category.id,
      submitted: false,
      label: label ?? `Version ${drafts + 1}`,
      ...(source
        ? {
          ranks: {
            create: source.ranks.map(({ phaseId, contenderId, rank }) => ({
              phaseId,
              contenderId,
              rank,
            })),
          },
          battles: {
            create: source.battles.map(
              ({ phaseId, round, slot, contenderAId, contenderBId, winnerId, scoreA, scoreB }) => ({
                phaseId,
                round,
                slot,
                contenderAId,
                contenderBId,
                winnerId,
                scoreA,
                scoreB,
              })
            ),
          },
        }
        : {}),
    },
    ...withContent,
  });

  res.status(201).json({ prediction });
});

// --- Écriture -----------------------------------------------------------------

/**
 * Enregistre le contenu d'une version. Le statut ne change pas ici : déposer
 * est un geste distinct, pour qu'un enregistrement de brouillon ne puisse
 * jamais valider un pronostic par inadvertance.
 */
predictionRouter.put('/:predictionId', async (req, res) => {
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Pronostic mal formé.', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const prediction = await loadMine(req.params.predictionId, req.user.id);
  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  const { category } = prediction;
  const closed = eventGate(category.event);
  if (closed) return res.status(409).json({ error: closed });

  const validContenders = new Set(category.contenders.map((c) => c.id));
  const openPhases = new Map(category.phases.filter((p) => !phaseIsLocked(p)).map((p) => [p.id, p]));

  const keepRank = (r) => openPhases.has(r.phaseId) && validContenders.has(r.contenderId);
  const keepBattle = (b) =>
    openPhases.has(b.phaseId) &&
    (!b.contenderAId || validContenders.has(b.contenderAId)) &&
    (!b.contenderBId || validContenders.has(b.contenderBId)) &&
    (!b.winnerId || [b.contenderAId, b.contenderBId].includes(b.winnerId));

  const ranks = body.ranks.filter(keepRank);
  const battles = body.battles.filter(keepBattle);
  const rejected = body.ranks.length - ranks.length + (body.battles.length - battles.length);

  const saved = await prisma.$transaction(async (tx) => {
    if (body.label) {
      await tx.prediction.update({ where: { id: prediction.id }, data: { label: body.label } });
    } else {
      // Touche updatedAt même quand seul le contenu change.
      await tx.prediction.update({ where: { id: prediction.id }, data: { updatedAt: new Date() } });
    }

    // On ne réécrit que les phases encore ouvertes : les phases verrouillées
    // gardent le pronostic déposé avant la fermeture.
    const openIds = [...openPhases.keys()];
    await tx.predictedRank.deleteMany({ where: { predictionId: prediction.id, phaseId: { in: openIds } } });
    await tx.predictedBattle.deleteMany({ where: { predictionId: prediction.id, phaseId: { in: openIds } } });

    if (ranks.length) {
      await tx.predictedRank.createMany({
        data: ranks.map((r) => ({ ...r, predictionId: prediction.id })),
      });
    }
    if (battles.length) {
      await tx.predictedBattle.createMany({
        data: battles.map((b) => ({
          predictionId: prediction.id,
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

    return tx.prediction.findUnique({ where: { id: prediction.id }, ...withContent });
  });

  res.json({
    prediction: saved,
    note: rejected ? `${rejected} choix ont été ignorés : ces phases sont déjà fermées.` : null,
  });
});

/** Renommer une version. */
predictionRouter.patch('/:predictionId', async (req, res) => {
  const { label } = z.object({ label: z.string().min(1).max(60) }).parse(req.body);
  const prediction = await loadMine(req.params.predictionId, req.user.id);
  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  const updated = await prisma.prediction.update({
    where: { id: prediction.id },
    data: { label },
  });
  res.json({ prediction: updated });
});

// --- Dépôt --------------------------------------------------------------------

/**
 * Dépose cette version. Une seule compte : celle qui était déposée redevient un
 * brouillon, elle n'est pas perdue. L'index partiel de la base garantit
 * l'invariant même si cette logique se trompait un jour.
 */
predictionRouter.post('/:predictionId/submit', async (req, res) => {
  const prediction = await loadMine(req.params.predictionId, req.user.id);
  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  const closed = eventGate(prediction.category.event);
  if (closed) return res.status(409).json({ error: closed });

  const result = await prisma.$transaction(async (tx) => {
    const previous = await tx.prediction.findFirst({
      where: {
        userId: req.user.id,
        categoryId: prediction.categoryId,
        submitted: true,
        id: { not: prediction.id },
      },
    });

    // L'ordre compte : on libère la place avant de la prendre, sinon l'index
    // unique partiel rejette la transaction.
    if (previous) {
      // Rétrograder, c'est aussi effacer le score : `scoredAt` est posé à
      // chaque publication de résultat, pas à la fin de l'événement. Le
      // laisser ferait apparaître un brouillon parmi les pronostics terminés,
      // avec des points qu'il ne rapporte plus.
      await tx.prediction.update({
        where: { id: previous.id },
        data: { submitted: false, points: 0, breakdown: null, scoredAt: null },
      });
    }
    const submitted = await tx.prediction.update({
      where: { id: prediction.id },
      data: { submitted: true },
      ...withContent,
    });

    return { submitted, demoted: previous?.label ?? null };
  });

  res.json({
    prediction: result.submitted,
    note: result.demoted
      ? `« ${result.demoted} » redevient un brouillon : un seul pronostic compte.`
      : null,
  });
});

/** Retire le dépôt sans rien perdre : la version redevient un brouillon. */
predictionRouter.post('/:predictionId/withdraw', async (req, res) => {
  const prediction = await loadMine(req.params.predictionId, req.user.id);
  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  const closed = eventGate(prediction.category.event);
  if (closed) return res.status(409).json({ error: closed });

  const updated = await prisma.prediction.update({
    where: { id: prediction.id },
    data: { submitted: false, points: 0, breakdown: null, scoredAt: null },
  });
  res.json({ prediction: updated });
});

// --- Suppression ---------------------------------------------------------------

predictionRouter.delete('/:predictionId', async (req, res) => {
  const prediction = await loadMine(req.params.predictionId, req.user.id);
  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  // Seul un pronostic DÉPOSÉ et scoré est figé : ses points comptent au
  // classement, l'effacer les ferait disparaître sans trace. Un brouillon reste
  // supprimable, même s'il porte un score hérité d'un ancien dépôt.
  if (prediction.submitted && prediction.scoredAt) {
    return res.status(409).json({
      error:
        'Ce pronostic est déposé et déjà scoré. Déposez une autre version, ou retirez-le, avant de le supprimer.',
    });
  }

  await prisma.prediction.delete({ where: { id: prediction.id } });
  res.json({ ok: true });
});