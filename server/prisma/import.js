/**
 * Importe un événement décrit en JSON.
 *
 *   node prisma/import.js prisma/data/gbb-2026.json
 *
 * Les artistes sont créés s'ils n'existent pas, réutilisés sinon : c'est ce qui
 * permet aux statistiques par artiste de traverser les éditions.
 * Relancer le script sur un événement déjà importé le remplace intégralement.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const file = process.argv[2];
if (!file) {
  console.error('Indiquez le fichier à importer : node prisma/import.js prisma/data/gbb-2026.json');
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf8'));

async function main() {
  // --- Artistes : créés une fois, réutilisés ensuite
  const artistBySlug = new Map();
  for (const a of data.artists) {
    const slug = slugify(a.name);
    const artist = await prisma.artist.upsert({
      where: { slug },
      create: { slug, name: a.name, country: a.country ?? null, aliases: a.aliases ?? [] },
      update: { name: a.name, country: a.country ?? null },
    });
    artistBySlug.set(slug, artist);
  }
  console.log(`${artistBySlug.size} artistes en base.`);

  // --- Événement : on repart de zéro s'il existe déjà
  const slug = data.event.slug ?? slugify(`${data.event.name}-${data.event.year}`);
  const existing = await prisma.event.findUnique({ where: { slug } });
  if (existing) {
    await prisma.event.delete({ where: { id: existing.id } });
    console.log('Ancienne version de l’événement supprimée.');
  }

  const event = await prisma.event.create({
    data: {
      slug,
      name: data.event.name,
      year: data.event.year,
      location: data.event.location ?? null,
      description: data.event.description ?? null,
      status: data.event.status ?? 'DRAFT',
      startsAt: data.event.startsAt ? new Date(data.event.startsAt) : null,
      endsAt: data.event.endsAt ? new Date(data.event.endsAt) : null,
    },
  });

  for (const cat of data.categories) {
    const category = await prisma.category.create({
      data: {
        eventId: event.id,
        name: cat.name,
        kind: cat.kind,
        slug: slugify(cat.name),
        position: cat.position ?? 0,
      },
    });

    const contenderByName = new Map();
    for (const con of cat.contenders) {
      const artistIds = (con.artists ?? [])
        .map((n) => artistBySlug.get(slugify(n)))
        .filter(Boolean)
        .map((a) => ({ artistId: a.id }));

      if ((con.artists ?? []).length !== artistIds.length) {
        console.warn(`  ! ${con.name} : un membre est absent de la liste d’artistes.`);
      }

      const created = await prisma.contender.create({
        data: {
          categoryId: category.id,
          name: con.name,
          seed: con.seed ?? null,
          wildcard: con.wildcard ?? false,
          artists: { create: artistIds },
        },
      });
      contenderByName.set(con.name, created);
    }

    for (const ph of cat.phases) {
      const phase = await prisma.phase.create({
        data: {
          categoryId: category.id,
          name: ph.name,
          type: ph.type,
          position: ph.position ?? 0,
          qualifierCount: ph.qualifierCount ?? null,
          locksAt: ph.locksAt ? new Date(ph.locksAt) : null,
        },
      });

      for (const b of ph.battles ?? []) {
        await prisma.battle.create({
          data: {
            phaseId: phase.id,
            round: b.round,
            slot: b.slot,
            label: b.label ?? null,
            contenderAId: contenderByName.get(b.contenderA)?.id ?? null,
            contenderBId: contenderByName.get(b.contenderB)?.id ?? null,
          },
        });
      }
    }

    console.log(`  ${cat.name} : ${cat.contenders.length} inscrits, ${cat.phases.length} phases.`);
  }

  console.log(`\n« ${event.name} ${event.year} » importé — /evenements/${event.slug}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
