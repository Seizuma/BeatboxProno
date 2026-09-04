import { useI18n } from '../lib/i18n.jsx';
import ArtistFigure from './ArtistFigure.jsx';

/**
 * Les lectures de la foule : ce qu'on attendait face à ce qui s'est produit.
 *
 * ─── Pourquoi ce composant a déménagé ───────────────────────────────────────
 *
 * Ces trois palmarès vivaient en bas de la page de classement, sous le tableau
 * des joueurs. C'était le mauvais endroit pour deux raisons.
 *
 * D'abord ils ne parlent pas de la même chose que la page qui les portait : le
 * classement répond à « qui marque le plus », eux répondent à « qui la foule
 * a mal placé ». Deux questions, deux objets — des joueurs d'un côté, des
 * artistes de l'autre.
 *
 * Ensuite, sans filtre d'événement actif, ils mélangeaient toutes les compètes
 * de l'histoire du site : « sous-coté » n'y voulait plus dire grand-chose, et
 * la colonne qui précisait l'événement ligne par ligne était l'aveu que le
 * cadrage manquait. Rattachés à un événement, ils redeviennent une lecture de
 * CETTE compète.
 *
 * Le composant reste générique — il ne sait pas d'où viennent ses lignes — pour
 * qu'un futur cadrage par format ou par groupe puisse le réutiliser tel quel.
 *
 * @param {object} readings  { wellRead, underRated, overRated, sampled }
 * @param {boolean} [showEvent]  affiche l'événement sous chaque nom. Inutile
 *   quand tout vient de la même compète, indispensable sinon.
 */
export default function ReadingBoards({ readings, showEvent = false }) {
    if (!readings || !(readings.sampled > 0)) return null;

    return (
        <>
            <ReadingBoard which="wellRead" rows={readings.wellRead} showEvent={showEvent} />
            <ReadingBoard which="underRated" rows={readings.underRated} tone="ok" showEvent={showEvent} />
            <ReadingBoard which="overRated" rows={readings.overRated} tone="warn" showEvent={showEvent} />
        </>
    );
}

/**
 * Un palmarès de lecture. L'écart est signé — positif, l'artiste a fini mieux
 * que prévu.
 */
function ReadingBoard({ which, rows, tone, showEvent }) {
    const { t } = useI18n();
    if (!rows?.length) return null;

    const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--r)' : 'var(--accent)';

    return (
        <section className="stack">
            <div>
                <h2>{t(`stats.${which}`)}</h2>
                <p className="muted" style={{ fontSize: '0.88rem' }}>{t(`stats.${which}.lede`)}</p>
            </div>
            <div className="panel panel--flush">
                <table>
                    <thead>
                        <tr>
                            <th>{t('stats.col.artist')}</th>
                            <th className="num">{t('stats.col.expected')}</th>
                            <th className="num">{t('stats.col.actual')}</th>
                            <th className="num">{t('stats.col.gap')}</th>
                            {/* Le nombre d'avis cède la place sous 620 px :
                                cinq colonnes de chiffres sur un téléphone se
                                lisent moins bien qu'aucune, et celle-ci est la
                                seule qui ne participe pas au verdict — elle dit
                                la fiabilité de la mesure, pas son résultat. */}
                            <th className="num col-opt">{t('stats.col.voters')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.contenderId}>
                                <td>
                                    <span className="stat-row">
                                        <ArtistFigure src={r.imageUrl} name={r.name} size="xs" />
                                        <span>
                                            {r.name}
                                            {/* La catégorie suffit quand tout vient de la même
                                                compète ; répéter le nom de l'événement à chaque
                                                ligne d'une page qui lui est déjà consacrée est du
                                                bruit. */}
                                            <span className="faint data" style={{ fontSize: '0.78rem', display: 'block' }}>
                                                {showEvent ? `${r.event} · ${r.category}` : r.category}
                                            </span>
                                        </span>
                                    </span>
                                </td>
                                <td className="num muted">{r.expected}</td>
                                <td className="num">{r.actual}</td>
                                <td className="num" style={{ color, fontWeight: 600 }}>
                                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                                </td>
                                <td className="num muted col-opt">{r.voters}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}