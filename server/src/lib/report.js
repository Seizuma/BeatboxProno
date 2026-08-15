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
async function countByDay(table, column, from, extra = '') {
    // Le regroupement se fait en SQL et dans le bon fuseau : ramener toutes les
    // lignes pour les compter en JavaScript coûterait de plus en plus cher chaque
    // mois, pour un résultat identique.
    const rows = await prisma.$queryRawUnsafe(
        `SELECT to_char("${column}" AT TIME ZONE $1, 'YYYY-MM-DD') AS day, count(*)::int AS n
     FROM "${table}"
     WHERE "${column}" >= $2 ${extra}
     GROUP BY 1`,
        TZ,
        from
    );
    return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

/**
 * Rassemble les chiffres des `days` journées se terminant à `endsOn` incluse.
 *
 * Par défaut la période s'arrête HIER, pas aujourd'hui. Un rapport envoyé à
 * 8 h 05 sur la journée en cours ne parlerait que de ses cinq premières
 * minutes : la première version annonçait « Hier — 0 personne sur le site »
 * alors qu'elle lisait la journée qui commençait à peine.
 */
export async function collect(days = 30, endsOn = null) {
    const end = endsOn ?? localDay(new Date(Date.now() - 86_400_000));
    // On construit la fenêtre à reculons depuis la fin voulue.
    const endMs = new Date(`${end}T12:00:00Z`).getTime();
    const range = lastDays(days, new Date(endMs));
    const from = new Date(endMs - (days + 1) * 86_400_000);

    const [visits, newUsers, predictions, submitted] = await Promise.all([
        prisma.visit
            .groupBy({
                by: ['day'],
                where: { day: { gte: range[0], lte: end } },
                _count: { _all: true },
            })
            .then((rows) => new Map(rows.map((r) => [r.day, r._count._all]))),
        countByDay('User', 'createdAt', from),
        countByDay('Prediction', 'createdAt', from),
        // Un pronostic déposé n'est pas un brouillon : c'est lui qui compte comme
        // participation réelle.
        countByDay('Prediction', 'createdAt', from, 'AND "submitted" = true'),
    ]);

    const rows = range.map((day) => {
        const active = visits.get(day) ?? 0;
        const fresh = newUsers.get(day) ?? 0;
        return {
            day,
            active,
            fresh,
            // Un compte créé ce jour-là est forcément actif ce jour-là : le
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
        end,
        last: rows[rows.length - 1],
        previous: rows[rows.length - 2] ?? null,
        totals: {
            active: sum(rows, 'active'),
            fresh: sum(rows, 'fresh'),
            returning: sum(rows, 'returning'),
            predictions: sum(rows, 'predictions'),
            submitted: sum(rows, 'submitted'),
        },
        // Les deux moitiés de la période, pour dire si ça monte ou si ça descend.
        firstHalf: rows.slice(0, half),
        secondHalf: rows.slice(half),
    };
}

/** Le nombre de personnes distinctes vues sur la période. */
export async function uniqueVisitors(since, until) {
    const rows = await prisma.visit.findMany({
        where: { day: { gte: since, lte: until } },
        select: { userId: true },
        distinct: ['userId'],
    });
    return rows.length;
}

/* ---------------------------------------------------------------------------
   Le graphique
   --------------------------------------------------------------------------- */

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Un vrai graphique en barres, sur plusieurs lignes.
 *
 * La première version tenait sur une ligne, une colonne par jour : avec un
 * maximum à 1, tout ce qui n'était pas zéro devenait un bloc plein de la même
 * hauteur, et la courbe ne disait plus rien. Sur plusieurs lignes, les
 * proportions redeviennent lisibles, et les blocs partiels donnent la précision
 * entre deux niveaux.
 *
 * La hauteur s'adapte au maximum : trois lignes suffisent quand on compte en
 * unités, huit deviennent utiles quand on compte en dizaines. Réserver huit
 * lignes pour un maximum de 1 ne dessinerait que du vide.
 */
export function barChart(values, { height = 6 } = {}) {
    const max = Math.max(...values, 1);
    const h = Math.min(height, Math.max(3, max));
    const width = String(max).length;
    const lines = [];

    for (let r = h; r >= 1; r -= 1) {
        const cells = values.map((v) => {
            const scaled = (v / max) * h;
            if (scaled >= r) return '█';
            if (scaled > r - 1) {
                return BLOCKS[Math.min(7, Math.max(0, Math.ceil((scaled - (r - 1)) * 8) - 1))];
            }
            return ' ';
        });
        // Seule la ligne du haut porte sa graduation : répéter le maximum à chaque
        // ligne encombrerait sans rien apprendre.
        lines.push(`${(r === h ? String(max) : '').padStart(width)} │${cells.join('')}`);
    }
    lines.push(`${'0'.padStart(width)} └${'─'.repeat(values.length)}`);
    return { lines, gutter: width + 2 };
}

const dm = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Les deux graphiques et leur axe des dates, dans un seul bloc de code. */
export function chart(report) {
    const { rows } = report;
    const active = barChart(rows.map((r) => r.active));
    const preds = barChart(rows.map((r) => r.predictions));

    const gutter = Math.max(active.gutter, preds.gutter);
    const pad = (block) => block.lines.map((l) => ' '.repeat(gutter - block.gutter) + l);

    const span = Math.max(1, rows.length - 10);
    const axis = `${' '.repeat(gutter)}${dm(rows[0].day)}${' '.repeat(span)}${dm(rows[rows.length - 1].day)}`;

    return [
        '```',
        'ACTIFS',
        ...pad(active),
        '',
        'PRONOS CRÉÉS',
        ...pad(preds),
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

/* ---------------------------------------------------------------------------
   La rédaction
   --------------------------------------------------------------------------- */

/**
 * L'écart entre deux valeurs.
 *
 * En pourcentage seulement au-dessus de cinq : sur de petits nombres, un
 * passage de 1 à 0 donnait « ↓ -100 % », ce qui dramatise une variation d'une
 * seule personne. En dessous, l'écart brut est plus honnête.
 */
function delta(current, previous) {
    const diff = current - previous;
    if (diff === 0) return '→ stable';
    const sign = diff > 0 ? '+' : '';
    if (previous < 5) return `${diff > 0 ? '↑' : '↓'} ${sign}${diff}`;
    return `${diff > 0 ? '↑' : '↓'} ${sign}${Math.round((diff / previous) * 100)} %`;
}

const plural = (n, word, suffix = 's') => `${n} ${word}${n > 1 ? suffix : ''}`;

/** Le jour, écrit en toutes lettres : « vendredi 15 août ». */
function longDay(day) {
    return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
}

/**
 * Les champs de l'encart Discord.
 *
 * Discord aligne trois champs en ligne : les chiffres saillants se lisent d'un
 * coup d'œil, sans les extraire d'un paragraphe. Le texte peut alors se
 * concentrer sur ce que les chiffres ne disent pas.
 */
export function fields(report, uniques) {
    const { last, previous, totals, rows } = report;
    const avg = (totals.active / rows.length).toFixed(1);

    const withDelta = (value, field) =>
        previous ? `**${value}**\n${delta(last[field], previous[field])}` : `**${value}**`;

    return [
        { name: 'Actifs', value: withDelta(last.active, 'active'), inline: true },
        { name: 'Nouveaux comptes', value: withDelta(last.fresh, 'fresh'), inline: true },
        { name: 'Pronostics créés', value: withDelta(last.predictions, 'predictions'), inline: true },
        {
            name: `Sur ${rows.length} jours`,
            value: `**${uniques}** personne${uniques > 1 ? 's' : ''} distincte${uniques > 1 ? 's' : ''}`,
            inline: true,
        },
        { name: 'Inscriptions', value: `**${totals.fresh}**`, inline: true },
        {
            name: 'Pronostics',
            value: `**${totals.predictions}** dont ${totals.submitted} déposé${totals.submitted > 1 ? 's' : ''}`,
            inline: true,
        },
        { name: 'Moyenne quotidienne', value: `**${avg}** actifs par jour`, inline: true },
    ];
}

/**
 * Le commentaire.
 *
 * Court et volontairement : les chiffres sont déjà dans les champs au-dessus.
 * Ce qui reste ici, c'est ce qu'un tableau ne dit pas — la tendance, et le fait
 * que la courbe de fréquentation soit encore en train de se constituer.
 */
export function prose(report) {
    const { last, rows, firstHalf, secondHalf, totals } = report;
    const lines = [];

    if (totals.active === 0 && totals.predictions === 0) {
        lines.push('Aucune activité sur la période.');
    } else if (last.active === 0 && last.predictions === 0) {
        lines.push('Journée sans visite ni pronostic.');
    } else {
        lines.push(
            `Journée à ${plural(last.active, 'personne')} sur le site` +
            (last.returning ? `, dont ${plural(last.returning, 'de retour', '')}` : '') +
            (last.predictions ? `, pour ${plural(last.predictions, 'pronostic')}.` : '.')
        );
    }

    const avg = (list) => (list.length ? list.reduce((n, r) => n + r.active, 0) / list.length : 0);
    const a = avg(firstHalf);
    const b = avg(secondHalf);
    if (a > 0 || b > 0) {
        const half = Math.round(rows.length / 2);
        lines.push(
            `Les ${half} derniers jours tournent à **${b.toFixed(1)}** actifs par jour, ` +
            `contre ${a.toFixed(1)} sur les ${rows.length - half} précédents.`
        );
    }

    // Le chiffre qui compte vraiment : un site qu'on visite sans y jouer a un
    // problème que la seule courbe de fréquentation ne montre pas.
    if (totals.active >= 20) {
        const ratio = Math.round((totals.predictions / totals.active) * 100);
        lines.push(`**${ratio}** pronostics pour 100 visites sur la période.`);
    }

    return lines.join('\n');
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
                x: { ticks: { color: '#8a8a8a' }, grid: { color: '#3a3a3a' } },
                y: { beginAtZero: true, ticks: { color: '#8a8a8a', precision: 0 }, grid: { color: '#3a3a3a' } },
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
export async function buildReport(days = 30, endsOn = null) {
    const report = await collect(days, endsOn);
    const uniques = await uniqueVisitors(report.days[0], report.end);

    return {
        report,
        uniques,
        title: `Fréquentation — ${longDay(report.end)}`,
        description: [prose(report), chart(report), table(report)].join('\n'),
        fields: fields(report, uniques),
        imageUrl: chartUrl(report),
        footer: `${days} jours jusqu'au ${dm(report.end)} · ${TZ}`,
    };
}