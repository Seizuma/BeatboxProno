import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { withName } from '../lib/naming.js';
import { isWildcardCategory } from '../lib/wildcard.js';
import { itemById } from '../lib/cosmetics.js';

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

  /**
   * Le tampon posé sur le tableau, ou `null` pour le retirer.
   *
   * Les coordonnées sont des FRACTIONS bornées et non des pixels : la largeur du
   * bracket dépend de l'écran, et la carte exportée n'a la largeur d'aucun d'eux.
   * Les bornes sont ici et pas seulement dans l'interface, parce qu'une API
   * publique ne se fie pas à son client — un x de 40 sortirait le tampon de
   * l'image sans qu'aucune erreur ne soit levée.
   *
   * L'identifiant n'est pas vérifié contre le catalogue : un tampon retiré du
   * catalogue rendrait le pronostic indéposable, ce qui punirait le joueur pour
   * une décision qui n'est pas la sienne. Le rendu ignore simplement ce qu'il ne
   * connaît pas.
   */
  stamp: z
    .object({
      id: z.string().max(60),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .nullable()
    .optional(),

  /**
   * La pioche d'une sélection sur vidéo : { [phaseId]: [contenderId, ...] }.
   *
   * Le plateau que le joueur s'est constitué, classés compris. Il ne se déduit
   * PAS des rangs : un nom cherché mais pas encore placé n'a pas de rang, et
   * c'est justement lui qu'on perdait au rechargement.
   *
   * Les identifiants ne sont pas vérifiés contre la base, pour la même raison
   * que le tampon : un participant supprimé par l'organisateur rendrait le
   * pronostic indéposable, ce qui punirait le joueur d'une décision qui n'est
   * pas la sienne. Le client ignore ce qu'il ne sait pas résoudre.
   *
   * Les bornes, en revanche, sont ici : cinq cents entrées par phase suffisent
   * largement à une wildcard de GBB, et sans plafond la colonne accepterait
   * n'importe quel volume.
   */
  pool: z
    .record(z.string(), z.array(z.string().max(60)).max(500))
    .nullable()
    .optional(),

  ranks: z
    .array(z.object({ phaseId: z.string(), contenderId: z.string(), rank: z.number().int().min(1) }))
    .default([]),
  battles: z
    .array(
      z.object({
        phaseId: z.string(),
        // Les mêmes tours que le type énuméré de la base, ROUND_OF_32 compris.
        //
        // Un oubli ici ne casse pas l'affichage : Zod rejette la requête
        // ENTIÈRE dès qu'une seule affiche porte un tour inconnu. Le pronostic
        // devient indéposable, et le message « Pronostic mal formé » ne dit pas
        // lequel des deux cents champs pose problème.
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
  // « En cours » signifie que la compétition a commencé : les pronostics
  // ferment, sans quoi on pourrait parier sur une battle déjà jouée.
  if (event.status === 'LIVE') return 'La compétition a commencé, les pronostics sont fermés.';
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
/**
 * Piocher un artiste dans une catégorie de sélection.
 *
 * ─── Pourquoi le joueur crée des participants ───────────────────────────────
 *
 * Dans un événement à tableau, l'organisateur sait qui concourt : il compose la
 * liste, les joueurs la classent. Une sélection sur vidéo, c'est l'inverse —
 * au moment où l'on pronostique, PERSONNE ne sait qui a envoyé une wildcard.
 * Demander à l'organisateur de saisir cent cinquante noms avant l'ouverture
 * reviendrait à lui faire deviner la réponse pour poser la question.
 *
 * Le joueur pioche donc dans le référentiel des artistes, et le participant est
 * créé à la volée s'il n'existe pas encore.
 *
 * ─── Ce référentiel est commun, le plateau d'un joueur ne l'est pas ──────────
 *
 * `Contender` est une table PARTAGÉE, et doit le rester : deux joueurs qui
 * piochent Alem obtiennent le même participant, sinon le résultat officiel
 * saisi par l'organisateur n'en récompenserait qu'un des deux. C'est tout le
 * sens de la transaction ci-dessous.
 *
 * Mais la liste que voit un joueur sur son plateau n'est PAS cette table :
 * c'est la petite sélection qu'il a lui-même retenue, et elle se déduit de ses
 * propres rangs côté client. Confondre les deux donnait à chacun la pioche de
 * tous les autres. Cette route ne renvoie donc jamais la liste entière, juste
 * le participant demandé : à l'appelant de savoir ce qui est à lui.
 *
 * ─── Pourquoi un participant et pas un artiste ──────────────────────────────
 *
 * Tout l'aval — les rangs pronostiqués, le score, la fiche d'un artiste, la
 * saisie du résultat officiel — passe par `Contender`. Faire pointer les
 * pronostics sur `Artist` demanderait de réécrire les six. On crée donc le
 * participant manquant, et rien d'autre ne bouge.
 *
 * L'unicité est portée par la transaction : deux joueurs qui piochent le même
 * artiste à la même seconde obtiennent le même participant, pas deux.
 */
predictionRouter.post('/categories/:categoryId/pool', async (req, res) => {
  const { artistId } = z.object({ artistId: z.string().min(1) }).parse(req.body);

  const category = await prisma.category.findUnique({
    where: { id: req.params.categoryId },
    include: {
      event: { select: { status: true, predictionsCloseAt: true } },
      phases: { select: { id: true, type: true } },
    },
  });
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable.' });

  if (!isWildcardCategory(category)) {
    return res.status(400).json({
      error: "On ne pioche que dans une sélection. Ailleurs, c'est l'organisateur qui compose la liste.",
    });
  }

  // Les mêmes conditions que pour enregistrer un pronostic : une compète fermée
  // ne doit pas voir son plateau grossir.
  if (!['OPEN'].includes(category.event.status)) {
    return res.status(409).json({ error: 'Les pronostics sont fermés sur cet événement.' });
  }
  if (category.event.predictionsCloseAt && new Date() > category.event.predictionsCloseAt) {
    return res.status(409).json({ error: 'La date butoir des pronostics est passée.' });
  }

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { id: true, name: true, kinds: true },
  });
  if (!artist) return res.status(404).json({ error: 'Artiste introuvable.' });

  // Le format compte : on ne pioche pas un crew dans une sélection solo.
  if (!(artist.kinds ?? []).includes(category.kind)) {
    return res.status(400).json({
      error: `${artist.name} n'est pas référencé dans le format ${category.kind}.`,
    });
  }

  const contender = await prisma.$transaction(async (tx) => {
    const existing = await tx.contender.findFirst({
      where: { categoryId: category.id, artists: { some: { artistId: artist.id } } },
      include: { artists: { include: { artist: true } } },
    });
    if (existing) return existing;

    return tx.contender.create({
      data: {
        categoryId: category.id,
        // Pas de nom propre : le participant suit celui de son artiste, et un
        // changement de pseudo se propage partout au lieu d'être recopié ici.
        name: null,
        artists: { create: [{ artistId: artist.id }] },
      },
      include: { artists: { include: { artist: true } } },
    });
  });

  res.status(201).json({ contender: withName(contender) });
});

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
  /**
   * Un score doit confirmer le vainqueur désigné : annoncer Seizuma gagnant
   * puis saisir 1-2 est contradictoire. L'interface ne propose déjà que les
   * répartitions cohérentes, mais l'API ne s'y fie pas.
   */
  const scoreAgrees = (b) => {
    if (b.scoreA == null || b.scoreB == null) return true;
    if (!b.winnerId) return false; // un score sans vainqueur ne veut rien dire
    return b.winnerId === b.contenderAId ? b.scoreA > b.scoreB : b.scoreB > b.scoreA;
  };

  const keepBattle = (b) =>
    openPhases.has(b.phaseId) &&
    (!b.contenderAId || validContenders.has(b.contenderAId)) &&
    (!b.contenderBId || validContenders.has(b.contenderBId)) &&
    (!b.winnerId || [b.contenderAId, b.contenderBId].includes(b.winnerId)) &&
    scoreAgrees(b);

  const ranks = body.ranks.filter(keepRank);
  const battles = body.battles.filter(keepBattle);
  const rejected = body.ranks.length - ranks.length + (body.battles.length - battles.length);

  const saved = await prisma.$transaction(async (tx) => {
    // `undefined` laisse la colonne tranquille, `null` l'efface : c'est la
    // distinction que Prisma fait déjà, et elle tombe juste ici — un client qui
    // n'envoie pas la clé ne veut rien changer, un client qui envoie null retire.
    //
    // La pioche suit la même règle. Elle en a d'autant plus besoin que seules
    // les catégories wildcard l'envoient : partout ailleurs la clé est absente,
    // et la traiter comme un effacement viderait le plateau du joueur au
    // premier enregistrement fait depuis un autre écran.
    const head = {
      ...(body.stamp === undefined ? {} : { stamp: body.stamp }),
      ...(body.pool === undefined ? {} : { pool: body.pool }),
    };

    if (body.label) {
      await tx.prediction.update({
        where: { id: prediction.id },
        data: { label: body.label, ...head },
      });
    } else {
      // Touche updatedAt même quand seul le contenu change.
      await tx.prediction.update({
        where: { id: prediction.id },
        data: { updatedAt: new Date(), ...head },
      });
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

/**
 * Poser ou retirer le tampon d'un pronostic.
 *
 * ─── Pourquoi une route à part ──────────────────────────────────────────────
 *
 * `PUT /:predictionId` réécrit le contenu ENTIER : classements, affiches,
 * tampon. La fenêtre d'export ne connaît que le tampon ; l'y faire passer
 * enverrait des tableaux vides et effacerait le pronostic. Une route qui ne
 * touche qu'un champ ne peut pas en abîmer un autre.
 *
 * ─── Pourquoi aucune fermeture ne s'y applique ──────────────────────────────
 *
 * `eventGate` interdit d'écrire un pronostic après le coup d'envoi, et c'est
 * juste : ce serait parier sur une battle déjà jouée. Un tampon ne dit rien du
 * résultat, il décore une carte qu'on partage le plus souvent APRÈS la compète.
 * Lui appliquer la même barrière reviendrait à interdire de signer sa propre
 * affiche.
 *
 * L'appartenance est vérifiée deux fois : `loadMine` pour le pronostic, le
 * porte-monnaie pour l'objet. Sans le second contrôle, un identifiant posté à la
 * main donnerait le tampon le plus cher du catalogue à tout le monde — c'est
 * déjà la règle des tampons de groupe, et elle vaut ici pour la même raison.
 */
predictionRouter.put('/:predictionId/stamp', async (req, res) => {
  const parsed = z
    .object({
      stamp: z
        .object({
          id: z.string().min(1).max(60),
          // Des FRACTIONS bornées, jamais des pixels : la carte n'a pas la même
          // largeur à l'aperçu et à l'export, et l'aperçu lui-même dépend de
          // l'écran. Bornées ici et pas seulement dans l'interface — une API ne
          // se fie pas à son client.
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        })
        .nullable(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: 'Tampon mal formé.' });

  const prediction = await loadMine(req.params.predictionId, req.user.id);
  if (!prediction) return res.status(404).json({ error: 'Pronostic introuvable.' });

  const { stamp } = parsed.data;

  if (stamp) {
    const item = itemById(stamp.id);
    if (!item || item.slot !== 'stamp') {
      return res.status(400).json({ error: "Ce tampon n'existe pas." });
    }
    if (item.price > 0) {
      const owned = await prisma.walletEntry.findFirst({
        where: { userId: req.user.id, kind: 'PURCHASE', itemId: item.id },
        select: { id: true },
      });
      if (!owned) return res.status(403).json({ error: 'Vous ne possédez pas ce tampon.' });
    }
  }

  // `null` efface la colonne, exactement comme dans le PUT de contenu : c'est la
  // distinction que Prisma fait entre `undefined` — ne rien changer — et `null`.
  const updated = await prisma.prediction.update({
    where: { id: prediction.id },
    data: { stamp },
    select: { id: true, stamp: true },
  });

  res.json({ stamp: updated.stamp ?? null });
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