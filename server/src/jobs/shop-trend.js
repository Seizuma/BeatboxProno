import cron from 'node-cron';
import { refreshIfDue } from '../lib/shop-trend.js';
import { TZ } from '../lib/presence.js';

/**
 * Le rafraîchissement de la vitrine.
 *
 * ─── Une tâche quotidienne, deux rythmes ────────────────────────────────────
 *
 * La tendance se recalcule tous les deux jours, les promotions toutes les
 * semaines. On pourrait planifier deux tâches ; ce serait une erreur.
 *
 * Une planification cron « tous les deux jours » s'exprime par un jour du mois
 * pair ou impair, et dérive donc à chaque mois de 31 jours. Pire, elle ne
 * rattrape rien : si le conteneur redémarre pendant la fenêtre, le calcul saute
 * et la vitrine reste figée quatre jours sans que personne ne le remarque.
 *
 * Ici la tâche s'exécute chaque nuit et demande à `refreshIfDue` si quelque
 * chose est périmé. C'est la DATE du dernier calcul qui décide. Un redémarrage
 * n'a aucun effet, une coupure de deux jours se rattrape toute seule au premier
 * réveil, et le comportement se teste sans attendre deux jours.
 *
 * ─── Pourquoi dans le processus de l'API ────────────────────────────────────
 *
 * Même raison que le rapport quotidien : la tâche a besoin du client Prisma et
 * du catalogue déjà chargés ici. Et même corollaire — si l'API tournait un jour
 * en plusieurs exemplaires, le calcul se ferait en double. Il est idempotent,
 * donc sans dommage, mais autant le savoir.
 */

// Trois heures du matin : la boutique est vide, et le classement du lendemain
// est prêt avant que quiconque l'ouvre.
const SCHEDULE = process.env.SHOP_TREND_CRON ?? '0 3 * * *';

export async function runShopTrend({ force = false } = {}) {
    const done = await refreshIfDue({ force });

    if (!done.trend && !done.promos) {
        console.log('[boutique] rien à recalculer.');
        return done;
    }
    console.log(
        `[boutique] ${done.trend ? 'tendance recalculée' : 'tendance à jour'}, ` +
        `${done.promos ? 'promotions tirées' : 'promotions en cours'}.`
    );
    return done;
}

/** Installe la planification. */
export function scheduleShopTrend() {
    if (!cron.validate(SCHEDULE)) {
        console.error(`[boutique] SHOP_TREND_CRON invalide : « ${SCHEDULE} » — rafraîchissement désactivé.`);
        return null;
    }

    const task = cron.schedule(SCHEDULE, () => {
        runShopTrend().catch((err) => console.error('[boutique]', err));
    }, { timezone: TZ });

    // Un premier passage au démarrage, sans attendre trois heures du matin. Sur
    // une base neuve, c'est lui qui crée le tout premier classement — sans quoi
    // la boutique s'ouvrirait sans ordre ni promotion jusqu'à la nuit suivante.
    runShopTrend().catch((err) => console.error('[boutique]', err));

    console.log(`[boutique] rafraîchissement planifié « ${SCHEDULE} » (${TZ}).`);
    return task;
}

// Exécution directe, pour forcer un recalcul :
//   node src/jobs/shop-trend.js
//   node src/jobs/shop-trend.js --force
if (process.argv[1] && process.argv[1].endsWith('shop-trend.js')) {
    runShopTrend({ force: process.argv.includes('--force') })
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}