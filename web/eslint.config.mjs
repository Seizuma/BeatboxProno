import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Le filet qui manquait.
 *
 * ─── Pourquoi cette configuration existe ────────────────────────────────────
 *
 * Une variable définie dans un composant et utilisée dans un AUTRE, plus bas
 * dans le même fichier, passe toutes les vérifications que le projet faisait
 * jusqu'ici. Vite ne compile pas les fichiers un par un à la recherche de noms
 * inconnus, esbuild non plus : ni l'un ni l'autre ne fait d'analyse de portée.
 * Le code se construit, se déploie, et lève une ReferenceError au clic.
 *
 * C'est exactement ce qui est arrivé : `addContender`, déclarée dans
 * `EventPage`, appelée depuis `CategoryEditor` — deux composants du même
 * fichier, deux portées différentes. L'appel était enveloppé dans un `try` qui
 * transformait l'erreur en message d'écran ; le bouton « ne faisait rien ».
 *
 * ─── Ce qui est activé, et rien de plus ─────────────────────────────────────
 *
 * `no-undef` seul, plus les recommandations de base. Pas de règles de style :
 * elles produiraient des centaines d'avertissements sur du code existant qui
 * n'a rien demandé, et un rapport qu'on n'ouvre pas ne sert à rien. Ce fichier
 * a un seul travail, il doit rester silencieux tant qu'il n'a rien à dire.
 *
 *   npm run lint
 */
export default [
  js.configs.recommended,
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    // Les `eslint-disable` en place visent des règles éteintes ici : les
    // signaler comme inutiles serait exact et sans intérêt. Ils redeviendront
    // utiles le jour où l'on allumera react-hooks.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    // Le greffon n'est là que pour que les `eslint-disable-next-line
    // react-hooks/exhaustive-deps` déjà présents dans le code désignent une
    // règle qui EXISTE. Sans lui, chacun de ces commentaires devient lui-même
    // une erreur — trois lignes de bruit pour des désactivations légitimes.
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',

      // Éteintes : elles ont leur valeur, mais les activer aujourd'hui
      // ouvrirait un chantier sans rapport avec ce que ce filet doit attraper.
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',

      // Éteintes volontairement : elles disent quelque chose de vrai mais sans
      // rapport avec ce qu'on cherche ici, et leur bruit ferait passer la seule
      // ligne qui compte inaperçue.
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
    },
  },
];
