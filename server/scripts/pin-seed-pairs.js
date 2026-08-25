import { PrismaClient } from '@prisma/client';

/**
 * Fige le tirage actuel des tableaux qui n'en ont pas d'explicite.
 *
 * ─── À lancer AVANT de déployer le nouveau bracket.js ────────────────────────
 *
 * `firstRoundPair` utilise un motif par défaut quand `seedPairs` est vide. Ce
 * motif change : il produisait (1,8) (2,7) (3,6) (4,5), il produira
 * (1,8) (4,5) (2,7) (3,6) — le vrai tableau classique, où les deux têtes de
 * série ne se croisent qu'en finale.
 *
 * Sans précaution, toute phase au tirage implicite verrait donc son premier
 * tour recomposé du jour au lendemain, y compris les compétitions en cours.
 * Les pronostics déjà déposés seraient reconvertis, et des vainqueurs désignés
 * disparaîtraient avec les affiches qui les portaient.
 *
 * Ce script inscrit l'ANCIEN motif dans les phases concernées. Elles cessent
 * d'être implicites, donc le changement de défaut ne les atteint plus. Seuls
 * les tableaux créés ensuite suivront le vrai classique.
 *
 * ─── Sûr à relancer ──────────────────────────────────────────────────────────
 *
 * Il ne touche QUE les phases dont `seedPairs` est vide. Une phase déjà réglée
 * — explicitement ou par un passage précédent de ce script — est laissée telle
 * quelle. Le relancer deux fois ne fait rien la seconde fois.
 *
 *   node scripts/pin-seed-pairs.js          # affiche ce qui serait écrit
 *   node scripts/pin-seed-pairs.js --write  # écrit
 */

const prisma = new PrismaClient();

/** L'ancien motif par défaut : les rangs pris deux à deux depuis les extrémités. */
const legacyPairs = (size) => Array.from({ length: size / 2 }, (_, i) => [i + 1, size - i]);

const MAIN_LINE = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL'];

async function main() {
    const write = process.argv.includes('--write');

    const phases = await prisma.phase.findMany({
        where: { seedPairs: { equals: null } },
        include: {
            battles: { select: { round: true } },
            category: { select: { name: true, event: { select: { name: true, year: true } } } },
        },
    });

    let touched = 0;

    for (const phase of phases) {
        // La taille du tableau vient du PREMIER tour présent, pas du nombre total
        // d'affiches : une phase porte aussi ses quarts, ses demies et sa finale.
        const rounds = new Set(phase.battles.map((b) => b.round));
        const first = MAIN_LINE.find((r) => rounds.has(r));
        if (!first) continue;

        const slots = phase.battles.filter((b) => b.round === first).length;
        if (slots < 2) continue;

        const size = slots * 2;
        const pairs = legacyPairs(size);
        const where = `${phase.category.event.name} ${phase.category.event.year} · ${phase.category.name} · ${phase.name}`;

        console.log(`${write ? 'écrit  ' : 'à faire'} ${where} — top ${size}`);
        console.log(`         ${pairs.map((p) => p.join('-')).join('  ')}`);

        if (write) {
            await prisma.phase.update({ where: { id: phase.id }, data: { seedPairs: pairs } });
        }
        touched += 1;
    }

    console.log();
    if (touched === 0) {
        console.log('Aucune phase au tirage implicite : rien à faire.');
    } else if (write) {
        console.log(`${touched} phase(s) figée(s) sur leur tirage actuel.`);
    } else {
        console.log(`${touched} phase(s) seraient figées. Relancez avec --write pour appliquer.`);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());