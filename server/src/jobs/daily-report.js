import cron from 'node-cron';
import { buildReport } from '../lib/report.js';
import { postToDiscord } from '../lib/discord.js';
import { TZ } from '../lib/presence.js';

/**
 * Le rapport de fréquentation quotidien, posté dans le salon privé.
 *
 * Planifié dans le processus de l'API plutôt que par une crontab système : la
 * tâche a besoin du client Prisma, des variables d'environnement et du fuseau
 * déjà chargés ici. Une crontab appellerait un conteneur de plus, à maintenir
 * en parallèle, pour un message par jour.
 *
 * Corollaire à retenir : si l'API tourne un jour en plusieurs exemplaires, le
 * rapport partira en autant d'exemplaires. Sur un seul conteneur, c'est sans
 * objet.
 */

const DAYS = Number(process.env.REPORT_DAYS ?? 30);

// Par défaut à 8 h 05, heure de Paris : assez tôt pour ouvrir la journée
// dessus, assez tard pour que la journée précédente soit close.
const SCHEDULE = process.env.REPORT_CRON ?? '5 8 * * *';

export async function runDailyReport({ dryRun = false, days = DAYS } = {}) {
    const { text, imageUrl, day, uniques, report } = await buildReport(days);

    const footer = `${days} jours · ${uniques} personnes distinctes · ${TZ}`;

    if (dryRun) {
        console.log(`— rapport du ${day} —\n`);
        console.log(text);
        console.log(`\n${footer}`);
        if (imageUrl) console.log(`\nGraphique : ${imageUrl}`);
        return { ok: true, dryRun: true, report };
    }

    const sent = await postToDiscord('REPORT', {
        title: `Fréquentation — ${day}`,
        description: text,
        imageUrl,
        footer,
    });

    if (!sent.ok) console.error('[rapport] envoi échoué :', sent.error);
    else console.log(`[rapport] ${day} posté.`);

    return sent;
}

/** Installe la planification. Sans webhook configuré, ne fait rien. */
export function scheduleDailyReport() {
    if (!process.env.DISCORD_WEBHOOK_REPORTS) {
        console.warn('[rapport] DISCORD_WEBHOOK_REPORTS absent — rapport quotidien désactivé.');
        return null;
    }
    if (!cron.validate(SCHEDULE)) {
        console.error(`[rapport] REPORT_CRON invalide : « ${SCHEDULE} » — rapport désactivé.`);
        return null;
    }

    const task = cron.schedule(SCHEDULE, () => {
        runDailyReport().catch((err) => console.error('[rapport]', err));
    }, { timezone: TZ });

    console.log(`[rapport] planifié « ${SCHEDULE} » (${TZ}), fenêtre de ${DAYS} jours.`);
    return task;
}

// Exécution directe, pour tester ou rattraper un envoi :
//   node src/jobs/daily-report.js --dry-run
//   node src/jobs/daily-report.js --days=7
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const args = process.argv.slice(2);
    const daysArg = args.find((a) => a.startsWith('--days='));
    runDailyReport({
        dryRun: args.includes('--dry-run'),
        days: daysArg ? Number(daysArg.split('=')[1]) : DAYS,
    })
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}