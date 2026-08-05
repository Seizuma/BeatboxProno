import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { listPhotos, matchPhotos, photoUrl, PHOTO_DIR } from '../lib/photos.js';

/**
 * Rattachement des photos aux artistes. Deux gestes seulement : voir ce que le
 * dossier contient, et appliquer l'appariement. Rien n'est écrit sur le disque
 * des photos — seul Artist.imageUrl bouge.
 */
export const photoRouter = Router();
photoRouter.use(requireRole('ADMIN', 'MODERATOR'));

/** Aperçu : qui serait rattaché à quoi, sans rien enregistrer. */
photoRouter.get('/', async (_req, res) => {
  const [files, artists] = await Promise.all([
    listPhotos(),
    prisma.artist.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const report = matchPhotos(files, artists);
  res.json({
    directory: PHOTO_DIR,
    fileCount: files.length,
    ...report,
  });
});

/** Applique l'appariement. `force` réécrit aussi les photos déjà posées. */
photoRouter.post('/sync', async (req, res) => {
  const force = req.body?.force === true;
  const [files, artists] = await Promise.all([
    listPhotos(),
    prisma.artist.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (files.length === 0) {
    return res.status(409).json({
      error: `Aucune image lue dans ${PHOTO_DIR}. Le dossier est-il bien monté dans le conteneur ?`,
    });
  }

  const { matched, unmatchedArtists, unusedFiles } = matchPhotos(files, artists);
  const todo = matched.filter((m) => force || m.changed);

  await prisma.$transaction(
    todo.map((m) => prisma.artist.update({ where: { id: m.id }, data: { imageUrl: m.url } }))
  );

  res.json({
    updated: todo.length,
    alreadyUpToDate: matched.length - todo.length,
    unmatchedArtists,
    unusedFiles,
  });
});

/** Pose une photo à la main quand le nom de fichier ne colle pas. */
photoRouter.put('/:artistId', async (req, res) => {
  const { file } = req.body ?? {};
  if (!file) return res.status(400).json({ error: 'Indiquez le fichier à rattacher.' });

  const files = await listPhotos();
  if (!files.includes(file)) {
    return res.status(404).json({ error: `Fichier introuvable dans ${PHOTO_DIR} : ${file}` });
  }

  const artist = await prisma.artist.update({
    where: { id: req.params.artistId },
    data: { imageUrl: photoUrl(file) },
  });
  res.json({ artist });
});
