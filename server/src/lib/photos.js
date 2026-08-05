import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Les photos viennent d'un autre projet du VPS (Beatbox-Games). Le dossier est
 * monté en lecture seule dans le conteneur : on ne l'écrit jamais, on se
 * contente de le lire et d'enregistrer le chemin public dans Artist.imageUrl.
 */
export const PHOTO_DIR = process.env.ARTIST_PHOTOS_DIR ?? '/media/artists';
export const PHOTO_ROUTE = '/api/media/artists';

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

/** Les codes pays collés en fin de nom de fichier : « alem_fr.jpg ». */
const COUNTRY_SUFFIX = /-(?:[a-z]{2,3})$/;

export const slugify = (value) =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Liste les fichiers image du dossier, récursivement, en chemins relatifs. */
export async function listPhotos(dir = PHOTO_DIR, base = dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return []; // dossier non monté : on n'écroule rien
    throw err;
  }

  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listPhotos(full, base)));
    } else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

/** L'URL publique d'un fichier relatif au dossier de photos. */
export const photoUrl = (relative) =>
  `${PHOTO_ROUTE}/${relative.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Les clés sous lesquelles un fichier peut être reconnu. « Alem_FR.jpg » donne
 * ['alem-fr', 'alem'] : on teste la forme complète d'abord, puis sans le pays.
 */
export function keysForFile(relative) {
  const stem = path.basename(relative, path.extname(relative));
  const slug = slugify(stem);
  const keys = [slug];
  const stripped = slug.replace(COUNTRY_SUFFIX, '');
  if (stripped && stripped !== slug) keys.push(stripped);
  return keys;
}

/** Les clés sous lesquelles un artiste peut être reconnu. */
export function keysForArtist(artist) {
  const keys = [artist.slug, slugify(artist.name), ...(artist.aliases ?? []).map(slugify)];
  return [...new Set(keys.filter(Boolean))];
}

/**
 * Apparie fichiers et artistes.
 * @returns {{matched: Array, unmatchedArtists: Array, unusedFiles: string[]}}
 */
export function matchPhotos(files, artists) {
  const index = new Map(); // clé → fichier (le premier gagne, l'ordre est alphabétique)
  for (const file of files) {
    for (const key of keysForFile(file)) {
      if (!index.has(key)) index.set(key, file);
    }
  }

  const matched = [];
  const unmatchedArtists = [];
  const used = new Set();

  for (const artist of artists) {
    const key = keysForArtist(artist).find((k) => index.has(k));
    if (!key) {
      unmatchedArtists.push({ id: artist.id, name: artist.name, slug: artist.slug });
      continue;
    }
    const file = index.get(key);
    used.add(file);
    matched.push({
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      file,
      url: photoUrl(file),
      matchedOn: key,
      changed: artist.imageUrl !== photoUrl(file),
    });
  }

  return {
    matched,
    unmatchedArtists,
    unusedFiles: files.filter((f) => !used.has(f)),
  };
}
