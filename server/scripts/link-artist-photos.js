/**
 * Rattache les photos du dossier beatbox_artists aux artistes de la base.
 *
 *   docker compose exec api node scripts/link-artist-photos.js          # aperçu
 *   docker compose exec api node scripts/link-artist-photos.js --apply  # écrit
 *   docker compose exec api node scripts/link-artist-photos.js --apply --force
 *
 * Sans --apply, rien n'est modifié : le script se contente de dire ce qu'il
 * ferait. --force réécrit aussi les artistes qui ont déjà une photo.
 */
import { PrismaClient } from '@prisma/client';
import { listPhotos, matchPhotos, PHOTO_DIR } from '../src/lib/photos.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

async function main() {
  const files = await listPhotos();
  console.log(`Dossier   : ${PHOTO_DIR}`);
  console.log(`Fichiers  : ${files.length}`);

  if (files.length === 0) {
    console.error(
      "\nAucune image lue. Vérifiez le montage du dossier dans docker-compose.yml\n" +
        '(ARTIST_PHOTOS_DIR côté hôte, /media/artists côté conteneur).'
    );
    process.exitCode = 1;
    return;
  }

  const artists = await prisma.artist.findMany({ orderBy: { name: 'asc' } });
  const { matched, unmatchedArtists, unusedFiles } = matchPhotos(files, artists);
  const todo = matched.filter((m) => force || m.changed);

  console.log(`Artistes  : ${artists.length}`);
  console.log(`Appariés  : ${matched.length}`);
  console.log(`À écrire  : ${todo.length}\n`);

  for (const m of todo) console.log(`  ${m.name.padEnd(24)} → ${m.file}`);

  if (unmatchedArtists.length) {
    console.log(`\nSans photo (${unmatchedArtists.length}) :`);
    for (const a of unmatchedArtists) console.log(`  ${a.name}  [${a.slug}]`);
  }

  if (unusedFiles.length) {
    console.log(`\nFichiers non utilisés (${unusedFiles.length}) :`);
    for (const f of unusedFiles.slice(0, 40)) console.log(`  ${f}`);
    if (unusedFiles.length > 40) console.log(`  … et ${unusedFiles.length - 40} autres`);
  }

  if (!apply) {
    console.log('\nAperçu seulement. Relancez avec --apply pour enregistrer.');
    return;
  }

  await prisma.$transaction(
    todo.map((m) => prisma.artist.update({ where: { id: m.id }, data: { imageUrl: m.url } }))
  );
  console.log(`\n${todo.length} artiste(s) mis à jour.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
