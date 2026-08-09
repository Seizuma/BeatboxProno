/**
 * Contrôle de cohérence entre les participants d'un événement et la liste des
 * artistes.
 *
 *   docker compose exec api node scripts/check-artists.js           # rapport
 *   docker compose exec api node scripts/check-artists.js --repair  # corrige
 *
 * Signale trois écarts :
 *   1. les participants sans aucun artiste rattaché (les fantômes) ;
 *   2. les artistes en double sous le même slug ;
 *   3. les artistes que plus aucun participant n'utilise.
 *
 * Seul le premier est réparé automatiquement : les deux autres demandent un
 * arbitrage humain.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const repair = process.argv.includes('--repair');

const slugify = (value) =>
    String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

async function main() {
    // --- 1. Participants sans artiste ----------------------------------------
    const orphans = await prisma.contender.findMany({
        where: { artists: { none: {} } },
        include: { category: { include: { event: { select: { name: true, year: true } } } } },
        orderBy: { name: 'asc' },
    });

    console.log(`Participants sans artiste : ${orphans.length}`);
    for (const c of orphans) {
        console.log(`  ${c.name.padEnd(26)} ${c.category.kind.padEnd(12)} ${c.category.event.name} ${c.category.event.year}`);
    }

    // --- 2. Doublons d'artistes ----------------------------------------------
    const artists = await prisma.artist.findMany({ orderBy: { name: 'asc' } });
    const bySlug = new Map();
    for (const a of artists) {
        const key = slugify(a.name);
        if (!bySlug.has(key)) bySlug.set(key, []);
        bySlug.get(key).push(a);
    }
    const dupes = [...bySlug.entries()].filter(([, list]) => list.length > 1);
    console.log(`\nArtistes en double : ${dupes.length}`);
    for (const [key, list] of dupes) {
        console.log(`  ${key} → ${list.map((a) => `${a.name} [${a.slug}]`).join(' · ')}`);
    }

    // --- 3. Artistes jamais engagés ------------------------------------------
    const unused = await prisma.artist.findMany({
        where: { entries: { none: {} } },
        orderBy: { name: 'asc' },
        select: { name: true, slug: true },
    });
    console.log(`\nArtistes jamais engagés : ${unused.length}`);
    if (unused.length) console.log(`  ${unused.map((a) => a.name).join(' · ')}`);

    // --- Réparation ----------------------------------------------------------
    if (!repair) {
        console.log(
            orphans.length
                ? `\nRelancez avec --repair pour rattacher ou créer les ${orphans.length} artiste(s) manquant(s).`
                : '\nRien à réparer.'
        );
        return;
    }

    let linked = 0;
    let created = 0;
    for (const contender of orphans) {
        const slug = slugify(contender.name);
        // Séquentiel : deux participants du même nom dans deux catégories doivent
        // aboutir au même artiste, pas à deux doublons.
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
    console.log(`\n${orphans.length} réparé(s) : ${linked} rattaché(s), ${created} créé(s).`);
    console.log('Pensez à relancer link-artist-photos.js pour leur donner une photo.');
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());