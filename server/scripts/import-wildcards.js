import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

/**
 * Importer les qualifiés d'une sélection passée.
 *
 * ─── Pourquoi un script et pas une liste toute faite ────────────────────────
 *
 * Je n'ai pas pu récupérer les listes moi-même : le wiki Beatbox répond en 402
 * à toute lecture automatisée, et le réseau de mon environnement ne l'atteint
 * pas davantage. Écrire des noms de mémoire sur un site dont l'intérêt tient à
 * l'exactitude au sujet de personnes réelles serait la pire chose à faire — un
 * nom inventé se propage dans les fiches d'artistes, les scores et les
 * classements avant que quiconque le remarque.
 *
 * Ce script prend donc la source à la main et fait le reste. La source à
 * privilégier n'est d'ailleurs pas le wiki mais beatboxfrance.fr, qui publie
 * les qualifiés catégorie par catégorie : c'est l'organisateur lui-même.
 *
 * ─── Le format d'entrée ─────────────────────────────────────────────────────
 *
 * Un fichier texte, une ligne par qualifié, quatre champs séparés par des
 * points-virgules :
 *
 *     2024;Solo Mixte;1;Nom de scène
 *     2024;Solo Mixte;2;Autre nom
 *     2024;Solo Femme;1;Encore un autre
 *     2023;Crew;1;Nom du crew
 *
 * Le rang est celui de la wildcard. L'ordre des lignes n'a pas d'importance.
 *
 *   node scripts/import-wildcards.js qualifies.txt --dry-run
 *   node scripts/import-wildcards.js qualifies.txt
 *
 * ─── Ce que le script crée, et ce qu'il ne crée pas ─────────────────────────
 *
 * Il crée l'événement s'il manque, la catégorie, sa phase de sélection, les
 * participants et le classement officiel. Il NE crée pas d'artiste sans le
 * dire : un nom absent du référentiel est signalé et la ligne est ignorée,
 * parce qu'un artiste créé par erreur d'orthographe devient un doublon qu'on
 * ne remarque que des mois plus tard.
 *
 * Il est rejouable : relancer sur le même fichier ne duplique rien.
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const CREATE_ARTISTS = args.includes('--create-artists');

if (!file) {
    console.error('Usage : node scripts/import-wildcards.js <fichier> [--dry-run] [--create-artists]');
    process.exit(1);
}

const slugify = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** La discipline d'après le nom de la catégorie. */
function kindOf(label) {
    const n = label.toLowerCase();
    if (n.includes('loop')) return 'LOOPSTATION';
    if (n.includes('tag')) return 'TAG_TEAM';
    if (n.includes('crew') || n.includes('équipe') || n.includes('equipe')) return 'CREW';
    return 'SOLO';
}

function parse(text) {
    const rows = [];
    text.split(/\r?\n/).forEach((line, i) => {
        const raw = line.trim();
        if (!raw || raw.startsWith('#')) return;
        const [year, category, rank, ...rest] = raw.split(';').map((p) => p.trim());
        const name = rest.join(';').trim();
        if (!year || !category || !rank || !name) {
            console.warn(`  ligne ${i + 1} ignorée, quatre champs attendus : ${raw}`);
            return;
        }
        rows.push({ year: Number(year), category, rank: Number(rank), name });
    });
    return rows;
}

async function main() {
    const rows = parse(fs.readFileSync(file, 'utf8'));
    console.log(`${rows.length} ligne(s) lue(s).`);

    // Groupées par année puis par catégorie : un événement, une catégorie, une
    // phase, un classement — dans cet ordre, chacun dépendant du précédent.
    const byEvent = new Map();
    for (const r of rows) {
        const key = `${r.year}|${r.category}`;
        if (!byEvent.has(key)) byEvent.set(key, []);
        byEvent.get(key).push(r);
    }

    let missing = 0;
    let written = 0;

    for (const [key, list] of byEvent) {
        const [year, categoryLabel] = key.split('|');
        const kind = kindOf(categoryLabel);
        const eventName = 'Championnat de France';
        const eventSlug = slugify(`${eventName}-${year}`);

        list.sort((a, b) => a.rank - b.rank);
        console.log(`\n${eventName} ${year} — ${categoryLabel} (${kind}) : ${list.length} qualifié(s)`);

        // Chaque nom doit exister au référentiel. On résout AVANT d'écrire quoi
        // que ce soit : mieux vaut ne rien créer que créer une catégorie à
        // moitié peuplée qu'il faudra démêler.
        const resolved = [];
        for (const r of list) {
            const artist = await prisma.artist.findFirst({
                where: {
                    OR: [
                        { slug: slugify(r.name) },
                        { name: { equals: r.name, mode: 'insensitive' } },
                        { aliases: { has: r.name } },
                    ],
                },
                select: { id: true, name: true, kinds: true },
            });

            if (!artist) {
                if (!CREATE_ARTISTS) {
                    console.warn(`  ✗ ${r.rank}. ${r.name} — absent du référentiel, ligne ignorée`);
                    missing += 1;
                    continue;
                }
                console.log(`  + ${r.rank}. ${r.name} — artiste créé`);
                resolved.push({ ...r, artist: { id: null, name: r.name, create: true } });
                continue;
            }

            if (!(artist.kinds ?? []).includes(kind)) {
                console.warn(`  ! ${r.rank}. ${artist.name} — pas typé ${kind}, le type sera ajouté`);
            }
            resolved.push({ ...r, artist });
        }

        if (DRY || resolved.length === 0) continue;

        await prisma.$transaction(async (tx) => {
            const event =
                (await tx.event.findUnique({ where: { slug: eventSlug } })) ??
                (await tx.event.create({
                    data: { slug: eventSlug, name: eventName, year: Number(year), status: 'FINISHED' },
                }));

            const catSlug = slugify(categoryLabel);
            const category =
                (await tx.category.findFirst({ where: { eventId: event.id, slug: catSlug } })) ??
                (await tx.category.create({
                    data: { eventId: event.id, name: categoryLabel, slug: catSlug, kind, position: 0 },
                }));

            const phase =
                (await tx.phase.findFirst({ where: { categoryId: category.id, type: 'WILDCARD' } })) ??
                (await tx.phase.create({
                    data: {
                        categoryId: category.id,
                        name: categoryLabel,
                        type: 'WILDCARD',
                        position: 0,
                        qualifierCount: resolved.length,
                    },
                }));

            // Le nombre de places suit la liste : c'est elle qui fait foi.
            await tx.phase.update({
                where: { id: phase.id },
                data: { qualifierCount: resolved.length, resolved: true },
            });

            const entries = [];
            for (const r of resolved) {
                let artistId = r.artist.id;
                if (r.artist.create) {
                    const made = await tx.artist.create({
                        data: { name: r.artist.name, slug: slugify(r.artist.name), kinds: [kind] },
                    });
                    artistId = made.id;
                } else if (!(r.artist.kinds ?? []).includes(kind)) {
                    await tx.artist.update({
                        where: { id: artistId },
                        data: { kinds: [...new Set([...(r.artist.kinds ?? []), kind])] },
                    });
                }

                const contender =
                    (await tx.contender.findFirst({
                        where: { categoryId: category.id, artists: { some: { artistId } } },
                    })) ??
                    (await tx.contender.create({
                        data: {
                            categoryId: category.id,
                            name: null,
                            seed: r.rank,
                            artists: { create: [{ artistId }] },
                        },
                    }));

                entries.push({ phaseId: phase.id, contenderId: contender.id, rank: r.rank, qualified: true });
            }

            // Remplacé plutôt que complété : relancer le script sur un fichier
            // corrigé doit donner le classement du fichier, pas sa fusion avec
            // le précédent.
            await tx.phaseEntry.deleteMany({ where: { phaseId: phase.id } });
            await tx.phaseEntry.createMany({ data: entries });
            written += entries.length;
        });

        console.log(`  → ${resolved.length} classement(s) enregistré(s)`);
    }

    console.log(
        `\n${DRY ? '[essai à blanc] ' : ''}${written} entrée(s) écrite(s), ${missing} nom(s) introuvable(s).`
    );
    if (missing && !CREATE_ARTISTS) {
        console.log(
            'Ajoutez les artistes manquants depuis l\'admin, ou relancez avec --create-artists\n' +
            'si vous êtes sûr de l\'orthographe — un artiste créé en double ne se voit que des mois plus tard.'
        );
    }
}

main()
    .catch((err) => {
        console.error(err.message ?? err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());