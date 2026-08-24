/**
 * Le journal des nouveautés.
 *
 * ─── Pourquoi ici et pas en base ─────────────────────────────────────────────
 *
 * Une note de version décrit un changement de code : sa place est dans le code,
 * versionnée avec lui. Stockée en base, elle aurait demandé un écran
 * d'administration, une gestion de traduction, et se serait désynchronisée du
 * code au premier oubli — on aurait annoncé une fonctionnalité retirée, ou
 * l'inverse.
 *
 * Ici, la note et le changement voyagent dans le même commit. Si la
 * fonctionnalité recule, la note recule avec elle.
 *
 * ─── Ce que la base retient ──────────────────────────────────────────────────
 *
 * Un seul champ par personne : `lastReadRelease`, l'identifiant de la dernière
 * note lue. Tout ce qui vient après est neuf, rien avant ne l'est. Le journal
 * reste consultable indéfiniment — il ne disparaît pas une fois lu, il cesse
 * simplement de réclamer l'attention.
 *
 * ─── La règle d'écriture ─────────────────────────────────────────────────────
 *
 * On n'y met QUE ce que les joueurs voient. Les corrections d'administration,
 * les refontes internes, les migrations n'ont rien à y faire : personne n'a
 * envie d'une pastille rouge pour apprendre qu'une route serveur a changé de
 * fichier. Chaque entrée doit répondre à « qu'est-ce que je peux faire de plus,
 * ou de différent, à partir de maintenant ? ».
 *
 * ─── Ajouter une note ────────────────────────────────────────────────────────
 *
 * Un objet en TÊTE de liste, avec un identifiant en date ISO — c'est lui qui
 * ordonne, et sa comparaison de chaînes est chronologique. Puis les clés de
 * traduction correspondantes dans `i18n.jsx`, côté anglais ET français.
 */

export const RELEASES = [
    {
        id: '2026-08-24',
        titleKey: 'news.r0.title',
        items: [
            'news.r0.groups',
            'news.r0.comments',
            'news.r0.bell',
            'news.r0.export',
            'news.r0.precision',
            'news.r0.search',
            'news.r0.artists',
            'news.r0.jury',
            'news.r0.mobile',
            'news.r0.logout',
        ],
    },
];

/** L'identifiant de la note la plus récente, ou `null` si le journal est vide. */
export const LATEST_RELEASE = RELEASES[0]?.id ?? null;

/**
 * Combien de notes cette personne n'a pas encore lues.
 *
 * Une comparaison de chaînes suffit : les identifiants sont des dates ISO, dont
 * l'ordre lexicographique est chronologique. Un curseur vide — quelqu'un qui
 * n'a jamais ouvert le journal — rend TOUTES les notes neuves, ce qui est le
 * comportement voulu au premier déploiement.
 */
export function unreadReleases(lastReadRelease) {
    const cursor = lastReadRelease ?? '';
    return RELEASES.filter((r) => r.id > cursor).length;
}