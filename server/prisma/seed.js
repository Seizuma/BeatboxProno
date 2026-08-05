/**
 * Jeu de démonstration : la structure d'un GBB avec les cinq catégories
 * demandées. Les noms d'artistes sont des exemples à remplacer depuis
 * l'interface d'administration — c'est la forme qui compte ici.
 *
 *   npm run seed
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ARTISTS = [
  ['Alexinho', 'FR'], ['NaPoM', 'US'], ['River', 'JP'], ['Colaps', 'FR'],
  ['Zekka', 'JP'], ['Julard', 'FR'], ['Chizzy', 'US'], ['Helium', 'FR'],
  ['Inertia', 'US'], ['Pepero', 'KR'], ['Wing', 'KR'], ['Show-Go', 'JP'],
  ['SARO', 'DE'], ['Rythmind', 'FR'], ['Codfish', 'AU'], ['D-Low', 'GB'],
];

async function main() {
  console.log('Nettoyage…');
  await prisma.$transaction([
    prisma.predictedPodium.deleteMany(),
    prisma.predictedBattle.deleteMany(),
    prisma.predictedRank.deleteMany(),
    prisma.prediction.deleteMany(),
    prisma.podiumSlot.deleteMany(),
    prisma.battle.deleteMany(),
    prisma.phaseEntry.deleteMany(),
    prisma.phase.deleteMany(),
    prisma.contenderArtist.deleteMany(),
    prisma.contender.deleteMany(),
    prisma.category.deleteMany(),
    prisma.event.deleteMany(),
    prisma.artist.deleteMany(),
  ]);

  const artists = {};
  for (const [name, country] of ARTISTS) {
    artists[name] = await prisma.artist.create({
      data: { name, country, slug: slugify(name) },
    });
  }

  const event = await prisma.event.create({
    data: {
      name: 'Grand Beatbox Battle',
      year: 2026,
      slug: 'grand-beatbox-battle-2026',
      location: 'Tokyo, Japon',
      status: 'OPEN',
      startsAt: new Date('2026-10-16T10:00:00Z'),
      endsAt: new Date('2026-10-18T22:00:00Z'),
      description:
        'Cinq catégories, trois jours. Les pronostics ferment au coup d’envoi de chaque phase.',
    },
  });

  /** Crée une catégorie complète : contenders + phases + arbre. */
  async function makeCategory({ name, kind, position, entries, phases }) {
    const category = await prisma.category.create({
      data: { eventId: event.id, name, kind, position, slug: slugify(name) },
    });

    const contenders = [];
    for (const [i, entry] of entries.entries()) {
      const members = Array.isArray(entry) ? entry : [entry];
      const label = members.join(' & ');
      contenders.push(
        await prisma.contender.create({
          data: {
            categoryId: category.id,
            name: label,
            seed: i + 1,
            artists: { create: members.map((m) => ({ artistId: artists[m].id })) },
          },
        })
      );
    }

    for (const [pi, p] of phases.entries()) {
      const phase = await prisma.phase.create({
        data: {
          categoryId: category.id,
          name: p.name,
          type: p.type,
          position: pi,
          qualifierCount: p.qualifierCount ?? null,
        },
      });

      for (const [round, count] of Object.entries(p.rounds ?? {})) {
        for (let slot = 0; slot < count; slot++) {
          await prisma.battle.create({
            data: {
              phaseId: phase.id,
              round,
              slot,
              // Les quarts sont pré-appariés par seeding, le reste reste ouvert.
              contenderAId: round === 'QUARTER' ? contenders[slot * 2]?.id ?? null : null,
              contenderBId: round === 'QUARTER' ? contenders[slot * 2 + 1]?.id ?? null : null,
            },
          });
        }
      }
    }
    return category;
  }

  await makeCategory({
    name: 'Solo',
    kind: 'SOLO',
    position: 0,
    entries: ['Alexinho', 'NaPoM', 'River', 'Julard', 'Chizzy', 'Helium', 'Inertia', 'Pepero'],
    phases: [
      { name: 'Éliminations', type: 'ELIMINATION', qualifierCount: 8 },
      { name: 'Bracket', type: 'BRACKET', rounds: { QUARTER: 4, SEMI: 2, FINAL: 1 } },
    ],
  });

  await makeCategory({
    name: 'Tag Team',
    kind: 'TAG_TEAM',
    position: 1,
    entries: [
      ['Colaps', 'Zekka'], ['Alexinho', 'Rythmind'], ['NaPoM', 'Chizzy'], ['River', 'Show-Go'],
      ['Wing', 'Pepero'], ['SARO', 'Helium'], ['Codfish', 'D-Low'], ['Julard', 'Inertia'],
    ],
    phases: [
      { name: 'Éliminations', type: 'ELIMINATION', qualifierCount: 8 },
      { name: 'Bracket', type: 'BRACKET', rounds: { QUARTER: 4, SEMI: 2, FINAL: 1 } },
    ],
  });

  await makeCategory({
    name: 'Loopstation',
    kind: 'LOOPSTATION',
    position: 2,
    entries: ['Show-Go', 'Rythmind', 'SARO', 'Inertia', 'Wing', 'Helium', 'River', 'Codfish'],
    phases: [{ name: 'Bracket', type: 'BRACKET', rounds: { QUARTER: 4, SEMI: 2, FINAL: 1 } }],
  });

  await makeCategory({
    name: 'Crew',
    kind: 'CREW',
    position: 3,
    entries: [
      ['Alexinho', 'Rythmind', 'Colaps'],
      ['NaPoM', 'Chizzy', 'Inertia'],
      ['River', 'Show-Go', 'Zekka'],
      ['Wing', 'Pepero', 'SARO'],
    ],
    phases: [
      { name: 'Élimination', type: 'ELIMINATION', qualifierCount: 4 },
      { name: 'Finales', type: 'BRACKET', rounds: { SMALL_FINAL: 1, FINAL: 1 } },
    ],
  });

  await makeCategory({
    name: 'Legacy',
    kind: 'LEGACY',
    position: 4,
    entries: ['Alexinho', 'NaPoM', 'D-Low', 'Codfish'],
    phases: [{ name: 'Legacy battles', type: 'LEGACY', rounds: { LEGACY: 2 } }],
  });

  console.log(`Événement « ${event.name} ${event.year} » créé avec 5 catégories.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
