import { Router, raw } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import {
  listPhotos,
  matchPhotos,
  photoUrl,
  sniffImage,
  slugify,
  uploadUrl,
  isUpload,
  PHOTO_DIR,
  UPLOAD_DIR,
} from '../lib/photos.js';

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

/**
 * Téléversement d'une photo pour un artiste.
 *
 * Le corps de la requête est l'image brute, envoyée telle quelle avec son
 * Content-Type : pas de multipart, donc pas de dépendance supplémentaire à
 * embarquer pour une seule route. Le client poste simplement l'objet File.
 */
photoRouter.post(
  '/upload/:artistId',
  raw({ type: ['image/*'], limit: '8mb' }),
  async (req, res) => {
    const artist = await prisma.artist.findUnique({ where: { id: req.params.artistId } });
    if (!artist) return res.status(404).json({ error: 'Artiste introuvable.' });

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Aucune image reçue.' });
    }

    // On se fie à la signature binaire, pas au nom du fichier ni au
    // Content-Type : les deux se falsifient, et ce fichier finira servi
    // publiquement.
    const kind = sniffImage(req.body);
    if (!kind) {
      return res.status(415).json({ error: 'Format non reconnu. Attendu : JPEG, PNG, WebP ou GIF.' });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // Le nom est reconstruit à partir du slug : rien de ce que le client
    // envoie ne se retrouve dans un chemin de fichier.
    const filename = `${slugify(artist.slug || artist.name)}-${Date.now()}.${kind.ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, filename), req.body);

    const previous = artist.imageUrl;
    const updated = await prisma.artist.update({
      where: { id: artist.id },
      data: { imageUrl: uploadUrl(filename) },
    });

    // On ne nettoie que nos propres fichiers : jamais ceux du dossier monté.
    if (isUpload(previous)) {
      const old = path.basename(decodeURIComponent(previous));
      await fs.unlink(path.join(UPLOAD_DIR, old)).catch(() => { });
    }

    res.status(201).json({ artist: updated, file: filename, bytes: req.body.length });
  }
);

/** Retire la photo d'un artiste, et le fichier s'il nous appartient. */
photoRouter.delete('/upload/:artistId', async (req, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: req.params.artistId } });
  if (!artist) return res.status(404).json({ error: 'Artiste introuvable.' });

  if (isUpload(artist.imageUrl)) {
    const old = path.basename(decodeURIComponent(artist.imageUrl));
    await fs.unlink(path.join(UPLOAD_DIR, old)).catch(() => { });
  }
  const updated = await prisma.artist.update({
    where: { id: artist.id },
    data: { imageUrl: null },
  });
  res.json({ artist: updated });
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