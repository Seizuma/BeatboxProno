import { Router } from 'express';
import { buildScoreboard, resolveScope, scoreboardFilters } from '../lib/scoreboard.js';

export const statsRouter = Router();

/**
 * Relaie les erreurs d'un gestionnaire asynchrone vers le middleware d'erreur.
 * Sans cela, une exception devient un rejet non géré : le processus tombe et le
 * navigateur voit une connexion coupée plutôt qu'un message.
 */
const guard = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * Le classement du site. Les points disent qui gagne, la réussite en battle dit
 * comment, et les lectures de foule disent qui tout le monde a mal placé.
 *
 * Le calcul lui-même vit dans `lib/scoreboard.js` : les groupes privés
 * demandent le même travail sur un sous-ensemble de joueurs, et deux copies du
 * barème auraient divergé au premier ajustement.
 *
 * « /scoreboard » et non « /stats » : les listes EasyPrivacy des bloqueurs de
 * pub (uBlock, AdGuard, Brave…) coupent côté navigateur toute requête dont
 * l'URL contient « /stats? ». Le filtre par événement devenait « serveur
 * injoignable » sans jamais atteindre l'API — d'où l'absence totale de logs.
 * L'ancien chemin reste en alias pour les onglets ouverts pendant un déploiement.
 */
statsRouter.get(['/scoreboard/filters', '/stats/filters'], guard(async (_req, res) => {
  res.json(await scoreboardFilters());
}));

statsRouter.get(['/scoreboard', '/stats'], guard(async (req, res) => {
  const scope = await resolveScope({ event: req.query.event, kind: req.query.kind });
  if (scope.notFound) return res.status(404).json({ error: 'Événement introuvable.' });

  const board = await buildScoreboard({
    eventId: scope.eventId,
    categoryKind: scope.categoryKind,
    // `?full=1` ajoute la liste complète des participants mesurés. Optionnel et
    // non systématique : sans périmètre, elle ferait plusieurs centaines de
    // lignes envoyées à chaque ouverture du classement, pour un tableau que
    // seule la fenêtre de statistiques d'un événement affiche.
    readingsAll: req.query.full === '1',
  });

  res.json({
    scope: { event: scope.eventSlug, kind: scope.categoryKind },
    ...board,
  });
}));