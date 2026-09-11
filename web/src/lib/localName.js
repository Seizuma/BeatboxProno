/**
 * Les noms saisis par l'organisation, dans la langue du lecteur.
 *
 * ─── Pourquoi ce fichier existe ─────────────────────────────────────────────
 *
 * `i18n.jsx` traduit l'INTERFACE : des libellés que nous écrivons, connus à la
 * compilation, rangés dans deux dictionnaires. Un nom de catégorie n'est pas de
 * cette nature — c'est de la DONNÉE, saisie par l'organisation, qui n'existe
 * pas encore au moment où l'on écrirait sa traduction.
 *
 * « Wildcard Solo Femme » n'a donc rien à faire dans un dictionnaire : il
 * faudrait redéployer le site à chaque compète qui invente une catégorie, et
 * l'organisation ne pourrait pas corriger elle-même une traduction ratée.
 * La traduction voyage avec la donnée, dans une colonne `nameEn`.
 *
 * ─── Pourquoi une fonction plutôt qu'un `?? ` à chaque affichage ────────────
 *
 * Le nom d'une catégorie s'affiche à huit endroits : les onglets de la page
 * événement, l'en-tête de chaque phase, le sous-titre de la fenêtre de
 * résultat, les pastilles de l'accueil, le tableau du profil, celui d'un
 * groupe, et les deux générateurs d'affiche. Une règle recopiée huit fois est
 * une règle qui sera appliquée sept fois le jour où elle changera.
 */

/**
 * Le nom d'une catégorie ou d'une phase, pour un lecteur donné.
 *
 * ─── Le repli est le cas COURANT, pas une panne ─────────────────────────────
 *
 * « Solo », « Tag Team », « Loopstation », « Crew » s'écrivent pareil dans les
 * deux langues : leur `nameEn` reste vide, et c'est très bien. Rendre le champ
 * obligatoire aurait forcé l'organisation à recopier le nom français dans une
 * seconde case à chaque catégorie créée — une corvée qui finit toujours par
 * être bâclée, et une occasion de fautes de frappe sur un nom qui n'en avait
 * pas besoin.
 *
 * Vide veut donc dire « le nom d'origine fait l'affaire », et non « traduction
 * manquante ».
 *
 * ─── Pourquoi le français n'a pas sa colonne ────────────────────────────────
 *
 * `name` EST le nom français : c'est la langue de travail de l'organisation, et
 * celle dans laquelle l'administration est écrite. Ajouter un `nameFr` pour la
 * symétrie créerait deux sources pour la même chose, et la question « laquelle
 * fait foi ? » à chaque lecture.
 */
export function localName(entity, lang) {
  if (!entity) return '';
  if (lang === 'en' && entity.nameEn) return entity.nameEn;
  return entity.name ?? '';
}