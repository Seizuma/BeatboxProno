/**
 * Recalcule les points de toutes les catégories qui ont un résultat publié.
 *
 *   docker compose exec api node scripts/rescore.js           # aperçu
 *   docker compose exec api node scripts/rescore.js --apply   # écrit
 *
 * À lancer après un changement de barème : les points et leur détail sont
 * enregistrés au recalcul, pas lus à la volée. Sans ce passage, les
 * pronostics déjà scorés gardent l'ancien total — et le calque des points de
 * la fiche, l'ancien détail.
 *
 * Sans --apply, rien n'est modifié : le script calcule les nouveaux totaux et
 * dit, catégorie par catégorie, combien de pronostics bougent et de combien.
 * Avec --apply, chaque catégorie passe par `rescoreCategory`, exactement le
 * chemin du bouton « Recalculer » de l'administration.
 */
import { prisma } from '../src/lib/prisma.js';
import { scorePrediction } from '../src/lib/scoring.js';
import { rescoreCategory } from '../src/routes/admin.js';

const apply = process.argv.includes('--apply');

async function main() {
  const categories = await prisma.category.findMany({
    where: { phases: { some: { resolved: true } } },
    include: {
      event: { select: { name: true, year: true } },
      phases: { include: { entries: true, battles: true } },
    },
    orderBy: [{ eventId: 'asc' }, { position: 'asc' }],
  });

  console.log(`${categories.length} catégorie(s) avec un résultat publié.${apply ? '' : ' (aperçu)'}\n`);

  let moved = 0;
  for (const category of categories) {
    const label = `${category.event.name} ${category.event.year} — ${category.name}`;

    // L'aperçu refait le calcul sans rien écrire, pour dire ce qui va bouger.
    const predictions = await prisma.prediction.findMany({
      where: { categoryId: category.id, submitted: true },
      include: { ranks: true, battles: true, podium: true, user: { select: { username: true } } },
    });
    const changes = predictions
      .map((p) => ({ who: p.user.username, before: p.points, after: scorePrediction(p, category).total }))
      .filter((c) => c.before !== c.after);
    moved += changes.length;

    console.log(`${label} : ${changes.length}/${predictions.length} pronostic(s) changent`);
    for (const c of changes.sort((x, y) => (y.after - y.before) - (x.after - x.before)).slice(0, 10)) {
      const delta = c.after - c.before;
      console.log(`   ${c.who.padEnd(24)} ${String(c.before).padStart(4)} → ${String(c.after).padStart(4)}  (${delta > 0 ? '+' : ''}${delta})`);
    }
    if (changes.length > 10) console.log(`   … et ${changes.length - 10} autre(s)`);

    // Toujours appliqué, même sans changement de total : le détail enregistré
    // gagne l'endroit où chaque affiche a été trouvée, que lit le calque.
    if (apply) await rescoreCategory(category.id);
  }

  console.log(
    apply
      ? `\nRecalcul fait. ${moved} pronostic(s) ont changé de total.`
      : `\n${moved} pronostic(s) changeraient de total. Relancer avec --apply pour écrire.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
