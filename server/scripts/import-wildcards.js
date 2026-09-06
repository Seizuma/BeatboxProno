import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { postEmbeds } from '../src/lib/discord.js';

/**
 * Importer les qualifiés d'une sélection passée, et rendre compte dans le salon.
 *
 * ─── Pourquoi un script et pas une liste toute faite ────────────────────────
 *
 * Le wiki Beatbox répond en 402 à toute lecture automatisée. Écrire des noms de
 * mémoire sur un site dont l'intérêt tient à l'exactitude au sujet de personnes
 * réelles serait la pire chose à faire — un nom inventé se propage dans les
 * fiches d'artistes, les scores et les classements avant que quiconque le
 * remarque. La source à privilégier est beatboxfrance.fr, qui publie les
 * qualifiés catégorie par catégorie : c'est l'organisateur lui-même.
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
 *   node scripts/import-wildcards.js qualifies.txt --no-discord
 *
 * ─── Le compte rendu ────────────────────────────────────────────────────────
 *
 * Un import qui écrit dans la base sans laisser de trace est un import qu'on
 * refait deux fois par erreur. Le rapport part donc dans le salon, avec ce
 * qu'on veut vraiment y lire : les noms INTROUVABLES. Le reste est du bruit —
 * quand tout se passe bien, il n'y a rien à faire de la liste des réussites.
 *
 * Un essai à blanc ne poste rien : une répétition n'a pas à produire un message
 * public. `--no-discord` coupe l'envoi sur un import réel.
 *
 * ─── Ce que le script crée, et ce qu'il ne crée pas ─────────────────────────
 *
 * Il crée l'événement s'il manque, la catégorie, sa phase de sélection, les
 * participants et le classement officiel. Il NE crée pas d'artiste sans le
 * dire : un nom absent du référentiel est signalé et la ligne est ignorée,
 * parce qu'un artiste créé par erreur d'orthographe devient un doublon qu'on ne
 * remarque que des mois plus tard. `--create-artists` lève la garde.
 *
 * Il est rejouable : relancer sur le même fichier ne duplique rien.
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const CREATE_ARTISTS = args.includes('--create-artists');
const NO_DISCORD = args.includes('--no-discord');

if (!file) {
    console.error('Usage : node scripts/import-wildcards.js <fichier> [--dry-run] [--create-artists] [--no-discord]');
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
    const bad = [];
    text.split(/\r?\n/).forEach((line, i) => {
        const raw = line.trim();
        if (!raw || raw.startsWith('#')) return;
        const [year, category, rank, ...rest] = raw.split(';').map((p) => p.trim());
        const name = rest.join(';').trim();
        if (!year || !category || !rank || !name || Number.isNaN(Number(rank))) {
            bad.push({ line: i + 1, raw });
            return;
        }
        rows.push({ year: Number(year), category, rank: Number(rank), name });
    });
    return { rows, bad };
}

/* ---------------------------------------------------------------------------
   Le compte rendu

   Accumulé pendant l'exécution plutôt qu'affiché au fil de l'eau et perdu : la
   console sert à suivre, le rapport sert à décider quoi faire ensuite.
   --------------------------------------------------------------------------- */

const report = {
    file,
    read: 0,
    malformed: [],
    blocks: [],      // { label, kind, expected, written, missing[], retyped[], created[] }
    failed: [],      // { label, error }
};

/** Une liste bornée : un encart Discord ne dépasse pas quatre mille caractères. */
function list(items, max = 12) {
    if (items.length === 0) return null;
    const head = items.slice(0, max).join(', ');
    return items.length > max ? `${head}, et ${items.length - max} autre(s)` : head;
}

function buildEmbeds() {
    const written = report.blocks.reduce((n, b) => n + b.written, 0);
    const missing = report.blocks.flatMap((b) => b.missing);
    const created = report.blocks.flatMap((b) => b.created);
    const retyped = report.blocks.flatMap((b) => b.retyped);

    const fields = [
        { name: 'Lignes lues', value: `**${report.read}**`, inline: true },
        { name: 'Classements écrits', value: `**${written}**`, inline: true },
        { name: 'Catégories', value: `**${report.blocks.length}**`, inline: true },
    ];

    // Ce qui demande une action passe en premier et en clair. Le reste n'est
    // qu'un accusé de réception.
    if (missing.length) {
        fields.push({
            name: `⚠ Introuvables au référentiel — ${missing.length}`,
            value: list(missing) ?? '—',
        });
    }
    if (created.length) {
        fields.push({ name: `Artistes créés — ${created.length}`, value: list(created) ?? '—' });
    }
    if (retyped.length) {
        fields.push({ name: `Formats complétés — ${retyped.length}`, value: list(retyped) ?? '—' });
    }
    if (report.malformed.length) {
        fields.push({
            name: `Lignes mal formées — ${report.malformed.length}`,
            value: list(report.malformed.map((m) => `l.${m.line}`), 20) ?? '—',
        });
    }
    if (report.failed.length) {
        fields.push({
            name: `⚠ Catégories en échec — ${report.failed.length}`,
            value: report.failed.map((f) => `${f.label} : ${f.error}`).slice(0, 5).join('\n'),
        });
    }

    // Aligné sur le plus long intitulé, avec des espaces : le bloc est en
    // chasse fixe, un remplissage à points ressemblait à une faute de frappe
    // quand le nom faisait pile la largeur.
    const width = Math.max(0, ...report.blocks.map((b) => b.label.length));
    const detail = report.blocks
        .map((b) => `${b.label.padEnd(width)}  ${String(b.written).padStart(3)} / ${b.expected}`)
        .join('\n');

    return [
        {
            title: 'Import de qualifiés',
            description:
                (missing.length
                    ? `**${missing.length} nom(s) introuvable(s)** — ces lignes n'ont pas été importées.`
                    : 'Aucun nom manquant.') +
                (detail ? `\n\`\`\`\n${detail.slice(0, 3500)}\n\`\`\`` : ''),
            fields,
            footer: { text: `${file} · ${new Date().toLocaleString('fr-FR')}` },
        },
    ];
}

/* --------------------------------------------------------------------------- */

async function main() {
    const { rows, bad } = parse(fs.readFileSync(file, 'utf8'));
    report.read = rows.length;
    report.malformed = bad;

    for (const b of bad) console.warn(`  ligne ${b.line} ignorée, quatre champs attendus : ${b.raw}`);
    console.log(`${rows.length} ligne(s) lue(s).`);

    // Groupées par année puis par catégorie : un événement, une catégorie, une
    // phase, un classement — chacun dépendant du précédent.
    const byEvent = new Map();
    for (const r of rows) {
        const key = `${r.year}|${r.category}`;
        if (!byEvent.has(key)) byEvent.set(key, []);
        byEvent.get(key).push(r);
    }

    for (const [key, group] of byEvent) {
        const [year, categoryLabel] = key.split('|');
        const kind = kindOf(categoryLabel);
        const eventName = 'Championnat de France';
        const eventSlug = slugify(`${eventName}-${year}`);
        const label = `${eventName} ${year} — ${categoryLabel}`;

        const block = { label, kind, expected: group.length, written: 0, missing: [], retyped: [], created: [] };
        report.blocks.push(block);

        group.sort((a, b) => a.rank - b.rank);
        console.log(`\n${label} (${kind}) : ${group.length} qualifié(s)`);

        // Chaque nom doit exister au référentiel. On résout AVANT d'écrire quoi
        // que ce soit : mieux vaut ne rien créer que créer une catégorie à
        // moitié peuplée qu'il faudra démêler.
        const resolved = [];
        for (const r of group) {
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
                    block.missing.push(r.name);
                    continue;
                }
                console.log(`  + ${r.rank}. ${r.name} — artiste créé`);
                block.created.push(r.name);
                resolved.push({ ...r, artist: { id: null, name: r.name, create: true } });
                continue;
            }

            if (!(artist.kinds ?? []).includes(kind)) {
                console.warn(`  ! ${r.rank}. ${artist.name} — pas typé ${kind}, le type sera ajouté`);
                block.retyped.push(`${artist.name} (${kind})`);
            }
            resolved.push({ ...r, artist });
        }

        if (DRY || resolved.length === 0) continue;

        try {
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

                // Remplacé plutôt que complété : relancer le script sur un
                // fichier corrigé doit donner le classement du fichier, pas sa
                // fusion avec le précédent.
                await tx.phaseEntry.deleteMany({ where: { phaseId: phase.id } });
                await tx.phaseEntry.createMany({ data: entries });
                block.written = entries.length;
            });
            console.log(`  → ${block.written} classement(s) enregistré(s)`);
        } catch (err) {
            // Une catégorie qui échoue n'emporte pas les suivantes : la
            // transaction a tout annulé pour celle-là, et rien pour les autres.
            console.error(`  ✗ ${label} : ${err.message ?? err}`);
            report.failed.push({ label, error: err.message ?? String(err) });
        }
    }

    const written = report.blocks.reduce((n, b) => n + b.written, 0);
    const missing = report.blocks.reduce((n, b) => n + b.missing.length, 0);
    console.log(
        `\n${DRY ? '[essai à blanc] ' : ''}${written} entrée(s) écrite(s), ${missing} nom(s) introuvable(s).`
    );
    if (missing && !CREATE_ARTISTS) {
        console.log(
            "Ajoutez les artistes manquants depuis l'admin, ou relancez avec --create-artists\n" +
            "si vous êtes sûr de l'orthographe — un artiste créé en double ne se voit que des mois plus tard."
        );
    }

    /* --- Le salon ---------------------------------------------------------- */

    if (DRY) {
        console.log('[rapport] essai à blanc : rien n\'est posté.');
        return;
    }
    if (NO_DISCORD) {
        console.log('[rapport] envoi désactivé par --no-discord.');
        return;
    }

    // L'envoi ne peut pas faire échouer l'import : l'écriture a déjà eu lieu,
    // et sortir en erreur ici donnerait à croire qu'elle n'a pas abouti.
    const sent = await postEmbeds('REPORT', buildEmbeds());
    if (sent.ok) console.log('[rapport] posté dans le salon.');
    else console.warn('[rapport] non posté :', sent.error);
}

main()
    .catch((err) => {
        console.error(err.message ?? err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());