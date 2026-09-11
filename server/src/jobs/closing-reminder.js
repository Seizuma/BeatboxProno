import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { notifyEventClosing } from '../lib/notifications.js';
import { TZ } from '../lib/presence.js';

/**
 * Le rappel de fermeture.
 *
 * ─── Ce qu'il fait ──────────────────────────────────────────────────────────
 *
 * Toutes les heures, il cherche les compètes dont la date butoir tombe dans
 * les vingt-quatre prochaines heures et qui n'ont pas encore prévenu. Chacune
 * envoie un avis à ceux qui n'y ont rien déposé.
 *
 * ─── Pourquoi toutes les heures et pas plus souvent ─────────────────────────
 *
 * « Il reste vingt-quatre heures » ne se joue pas à la minute. Un passage
 * horaire veut dire qu'au pire le rappel part vingt-trois heures avant la
 * fermeture au lieu de vingt-quatre : personne ne le remarquera, et on divise
 * par soixante le nombre de réveils inutiles.
 *
 * ─── Pourquoi une fenêtre et pas un instant ─────────────────────────────────
 *
 * Chercher « la butoir est dans exactement 24 h » ne trouverait jamais rien :
 * le cron ne passe pas à la seconde près, et un conteneur redémarré au mauvais
 * moment raterait la fenêtre pour de bon. On prend donc tout ce qui ferme entre
 * maintenant et dans vingt-quatre heures.
 *
 * La conséquence est voulue : une compète dont la butoir est dans six heures au
 * moment où on l'ouvre reçoit son rappel au premier passage. C'est exactement ce
 * qu'on veut — mieux vaut un rappel tardif que pas de rappel.
 *
 * La borne basse est `now` et non `now - quelque chose` : une compète déjà
 * fermée n'a plus rien à rappeler, et prévenir après coup serait cruel.
 *
 * ─── Pourquoi le redémarrage ne spamme pas ──────────────────────────────────
 *
 * Le job tourne une fois au démarrage, comme `shop-trend`. Sur un conteneur qui
 * redémarre dix fois dans l'après-midi, c'est `notifyEventClosing` qui tient :
 * l'existence d'un avis pour cette compète arrête tous les passages suivants.
 * L'idempotence est dans la notification, pas dans la planification — c'est le
 * seul endroit où elle résiste à un redémarrage.
 *
 * ─── Pourquoi dans le processus de l'API ────────────────────────────────────
 *
 * Même raison que le rapport quotidien et la vitrine : le client Prisma est
 * déjà chargé ici. Et même corollaire — si l'API tournait un jour en plusieurs
 * exemplaires, la garde d'unicité de `notifyEventClosing` empêcherait quand
 * même le double envoi.
 */

/** Toutes les heures, à la minute 5 — hors des pics de trafic à l'heure ronde. */
const SCHEDULE = process.env.CLOSING_REMINDER_CRON ?? '5 * * * *';

/** La fenêtre d'avertissement, en heures. */
const HOURS_AHEAD = 24;

export async function runClosingReminder() {
  const now = new Date();
  const horizon = new Date(now.getTime() + HOURS_AHEAD * 3600 * 1000);

  /**
   * Seules les compètes OPEN.
   *
   * `LIVE` veut dire que la compétition a commencé et que les pronostics sont
   * fermés : rappeler d'y déposer serait faux. `DRAFT` n'est visible de
   * personne, `FINISHED` est derrière nous.
   */
  const events = await prisma.event.findMany({
    where: {
      status: 'OPEN',
      predictionsCloseAt: { gt: now, lte: horizon },
    },
    select: { id: true, name: true, year: true, predictionsCloseAt: true },
  });

  if (events.length === 0) return { checked: 0, notified: 0 };

  let notified = 0;
  for (const event of events) {
    const { sent, skipped } = await notifyEventClosing(event.id);
    if (skipped) continue;
    if (sent > 0) {
      notified += 1;
      console.log(`[rappel] ${event.name} ${event.year} — ${sent} compte(s) prévenu(s).`);
    }
  }

  return { checked: events.length, notified };
}

/** Installe la planification. */
export function scheduleClosingReminder() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[rappel] CLOSING_REMINDER_CRON invalide : « ${SCHEDULE} » — rappels désactivés.`);
    return null;
  }

  const task = cron.schedule(SCHEDULE, () => {
    runClosingReminder().catch((err) => console.error('[rappel]', err));
  }, { timezone: TZ });

  // Un passage au démarrage : sans lui, une compète qui ferme dans deux heures
  // attendrait le prochain top horaire pour prévenir.
  runClosingReminder().catch((err) => console.error('[rappel]', err));

  console.log(`[rappel] fermetures surveillées « ${SCHEDULE} » (${TZ}), ${HOURS_AHEAD} h à l'avance.`);
  return task;
}

// Exécution directe, pour forcer un passage :
//   docker compose exec api node src/jobs/closing-reminder.js
if (process.argv[1]?.endsWith('closing-reminder.js')) {
  runClosingReminder()
    .then((r) => {
      console.log(`[rappel] ${r.checked} compète(s) examinée(s), ${r.notified} rappel(s) envoyé(s).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[rappel]', err);
      process.exit(1);
    });
}