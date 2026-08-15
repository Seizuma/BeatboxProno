import { prisma } from './prisma.js';
import { TZ, lastDays, localDay } from './presence.js';

/**
 * Le rapport de fréquentation quotidien.
 *
 * Trois séries : les personnes actives dans la journée, celles qui viennent de
 * créer leur compte, et les pronostics créés. « Actifs moins nouveaux » donne
 * les revenants, qui est le chiffre qui dit si le site retient ou non.
 */

/** Regroupe une table par journée locale, sur une colonne d'horodatage. */
async function countByDay(table, column, from) {
    // Le regroupement se fait en SQL et dans le bon fuseau : ramener toutes les
    // lignes pour les compter en JavaScript coûterait de plus en plus cher chaque
    // mois, pour un résultat identique.
    const rows = await prisma.$queryRawUnsafe(
        `SELECT to_char("${column}" AT TIME ZONE $1, 'YYYY-MM-DD') AS day, count(*)::int AS n
     FROM "${table}"
     WHERE "${column}" >= $2
     GROUP BY 1`,
        TZ,
        from
    );
    return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

/**
 * Rassemble les chiffres des `days` derniers jours.
 *
 * @returns {Promise<{days: string[], rows: object[], totals: object, previous: object}>}
 */
export async function collect(days = 30) {
    const range = lastDays(days);
    // Une marge d'un jour : la conversion de fuseau peut décaler une ligne du
    // premier jour, autant la capturer et la filtrer ensuite.
    const from = new Date(Date.now() - (days + 1) * 86_400_000);

    const [visits, newUsers, predictions, submitted] = await Promise.all([
        prisma.visit
            .groupBy({ by: ['day'], where: { day: { gte: range[0] } }, _count: { _all: true } })
            .then((rows) => new Map(rows.map((r) => [r.day, r._count._all]))),
        countByDay('User', 'createdAt', from),
        countByDay('Prediction', 'createdAt', from),
        // Un pronostic déposé n'est pas un brouillon : c'est lui qui compte comme
        // participation réelle.
        prisma.$queryRawUnsafe(
            `SELECT to_char("createdAt" AT TIME ZONE $1, 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM "Prediction" WHERE "submitted" = true AND "createdAt" >= $2 GROUP BY 1`,
            TZ,
            from
        ).then((rows) => new Map(rows.map((r) => [r.day, Number(r.n)]))),
    ]);

    const rows = range.map((day) => {
        const active = visits.get(day) ?? 0;
        const fresh = newUsers.get(day) ?? 0;
        return {
            day,
            active,
            fresh,
            // Un compte créé aujourd'hui est forcément actif aujourd'hui : le
            // soustraire évite de compter la même personne dans les deux colonnes.
            returning: Math.max(0, active - fresh),
            predictions: predictions.get(day) ?? 0,
            submitted: submitted.get(day) ?? 0,
        };
    });

    const sum = (list, field) => list.reduce((n, r) => n + r[field], 0);
    const half = Math.floor(rows.length / 2);

    return {
        days: range,
        rows,
        today: rows[rows.length - 1],
        yesterday: rows[rows.length - 2] ?? null,
        totals: {
            active: sum(rows, 'active'),
            fresh: sum(rows, 'fresh'),
            returning: sum(rows, 'returning'),
            predictions: sum(rows, 'predictions'),
            submitted: sum(rows, 'submitted'),
            // Le total des actifs additionne les journées : quelqu'un qui vient tous
            // les jours y figure trente fois. Les personnes distinctes se comptent à
            // part, sinon on croit avoir trente joueurs quand on en a un assidu.
            uniques: 0,
        },
        // Les deux moitiés de la période, pour dire si ça monte ou si ça descend.
        firstHalf: rows.slice(0, half),
        secondHalf: rows.slice(half),
    };
}

/** Le nombre de personnes distinctes vues sur la période. */
export async function uniqueVisitors(since) {
    const rows = await prisma.visit.findMany({
        where: { day: { gte: since } },
        select: { userId: true },
        distinct: ['userId'],
    });
    return rows.length;
}

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Une série en barres verticales d'un caractère de large.
 *
 * Discord ne sait pas afficher un graphique, mais il affiche des blocs à
 * chasse fixe : trente colonnes tiennent sur une ligne, y compris sur
 * téléphone, et se lisent d'un coup d'œil. C'est aussi la seule solution qui ne
 * dépende d'aucun service extérieur — un rapport interne qui cesse d'arriver
 * parce qu'une API tierce est tombée ne sert à rien.
 */
function sparkline(values) {
    const max = Math.max(...values, 1);
    return values
        .map((v) => (v === 0 ? '·' : BLOCKS[Math.min(BLOCKS.length - 1, Math.ceil((v / max) * BLOCKS.length) - 1)]))
        .join('');
}

const dm = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Le graphique sur toute la période, en bloc de code. */
export function chart(report) {
    const { rows } = report;
    const line = (label, field) => {
        const values = rows.map((r) => r[field]);
        const max = Math.max(...values);
        return `${label.padEnd(9)} ${sparkline(values)}  max ${String(max).padStart(3)}`;
    };

    const width = rows.length;
    const axis = `${' '.repeat(10)}${dm(rows[0].day)}${' '.repeat(Math.max(1, width - 10))}${dm(rows[rows.length - 1].day)}`;

    return [
        '```',
        line('Actifs', 'active'),
        line('Nouveaux', 'fresh'),
        line('Pronos', 'predictions'),
        axis,
        '```',
    ].join('\n');
}

/** Le tableau chiffré des sept derniers jours. */
export function table(report) {
    const head = 'Jour    Actifs  Nouv.  Revenus  Pronos  Déposés';
    const lines = report.rows.slice(-7).map((r) =>
        [
            dm(r.day).padEnd(7),
            String(r.active).padStart(6),
            String(r.fresh).padStart(6),
            String(r.returning).padStart(8),
            String(r.predictions).padStart(7),
            String(r.submitted).padStart(8),
        ].join(' ')
    );
    return ['```', head, '─'.repeat(head.length), ...lines, '```'].join('\n');
}

/** Une flèche et un écart, pour lire la tendance sans faire le calcul. */
function trend(current, previous, unit = '') {
    if (previous === 0) return current === 0 ? '→ stable' : `↑ +${current}${unit}`;
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return '→ stable';
    return `${pct > 0 ? '↑' : '↓'} ${pct > 0 ? '+' : ''}${pct} %`;
}

/**
 * Le rapport écrit.
 *
 * Un rapport quotidien qu'on ne lit pas est un rapport inutile : celui-ci dit
 * d'abord ce qui s'est passé hier, puis seulement ensuite la tendance du mois.
 */
export function prose(report, uniques) {
    const { today, yesterday, rows, firstHalf, secondHalf } = report;
    const avg = (list, f) => (list.length ? list.reduce((n, r) => n + r[f], 0) / list.length : 0);
    const days = rows.length;

    const lines = [];

    lines.push(
        `**Hier** — ${today.active} personne${today.active > 1 ? 's' : ''} sur le site, ` +
        `dont ${today.fresh} nouveau${today.fresh > 1 ? 'x' : ''} et ${today.returning} de retour. ` +
        `${today.predictions} pronostic${today.predictions > 1 ? 's' : ''} créé${today.predictions > 1 ? 's' : ''}` +
        (today.submitted ? `, dont ${today.submitted} déposé${today.submitted > 1 ? 's' : ''}.` : '.')
    );

    if (yesterday) {
        lines.push(
            `**Par rapport à la veille** — fréquentation ${trend(today.active, yesterday.active)}, ` +
            `pronostics ${trend(today.predictions, yesterday.predictions)}.`
        );
    }

    lines.push(
        `**Sur ${days} jours** — ${uniques} personne${uniques > 1 ? 's' : ''} distincte${uniques > 1 ? 's' : ''} ` +
        `${report.totals.fresh > 0 ? `(${report.totals.fresh} inscription${report.totals.fresh > 1 ? 's' : ''})` : '(aucune inscription)'}, ` +
        `${report.totals.predictions} pronostic${report.totals.predictions > 1 ? 's' : ''} créé${report.totals.predictions > 1 ? 's' : ''}, ` +
        `${report.totals.submitted} déposé${report.totals.submitted > 1 ? 's' : ''}. ` +
        `Moyenne de ${avg(rows, 'active').toFixed(1)} actifs par jour.`
    );

    const a = avg(firstHalf, 'active');
    const b = avg(secondHalf, 'active');
    lines.push(
        `**Tendance** — la seconde quinzaine tourne à ${b.toFixed(1)} actifs par jour ` +
        `contre ${a.toFixed(1)} pour la première : ${trend(Math.round(b * 10), Math.round(a * 10))}.`
    );

    // Le chiffre qui compte vraiment : un site qu'on visite sans y jouer a un
    // problème que la courbe de fréquentation seule ne montre pas.
    const idle = report.totals.active > 0
        ? Math.round((1 - report.totals.predictions / report.totals.active) * 100)
        : 0;
    if (report.totals.active >= 10) {
        lines.push(
            `**Conversion** — ${100 - idle} pronostic${100 - idle > 1 ? 's' : ''} pour 100 visites de la période.`
        );
    }

    return lines.join('\n\n');
}

/**
 * Une URL d'image de graphique, si un service QuickChart est configuré.
 *
 * Facultatif et volontairement : le rapport se suffit sans lui. Renseigner
 * QUICKCHART_URL avec une instance auto-hébergée (image Docker `ianw/quickchart`)
 * garde les chiffres à la maison ; pointer vers quickchart.io les envoie chez un
 * tiers, ce qui reste acceptable pour des agrégats mais mérite d'être su.
 */
export function chartUrl(report) {
    const base = process.env.QUICKCHART_URL;
    if (!base) return null;

    const config = {
        type: 'bar',
        data: {
            labels: report.rows.map((r) => dm(r.day)),
            datasets: [
                { label: 'Actifs', data: report.rows.map((r) => r.active), backgroundColor: '#00e8e8' },
                { label: 'Nouveaux', data: report.rows.map((r) => r.fresh), backgroundColor: '#ffe400' },
                { label: 'Pronos', data: report.rows.map((r) => r.predictions), backgroundColor: '#ff3ce8' },
            ],
        },
        options: {
            plugins: { legend: { labels: { color: '#e8e8e8' } } },
            scales: {
                x: { stacked: false, ticks: { color: '#8a8a8a' }, grid: { color: '#3a3a3a' } },
                y: { beginAtZero: true, ticks: { color: '#8a8a8a' }, grid: { color: '#3a3a3a' } },
            },
        },
    };

    const url = new URL('/chart', base);
    url.searchParams.set('bkg', '#0b0b0b');
    url.searchParams.set('w', '900');
    url.searchParams.set('h', '320');
    url.searchParams.set('c', JSON.stringify(config));
    return url.toString();
}

/** Assemble le message complet destiné au salon privé. */
export async function buildReport(days = 30) {
    const report = await collect(days);
    const uniques = await uniqueVisitors(report.days[0]);
    return {
        report,
        uniques,
        day: localDay(),
        text: [prose(report, uniques), chart(report), table(report)].join('\n'),
        imageUrl: chartUrl(report),
    };
}