-- Le cadre « Filet » passe à zéro point.
--
-- Un compte neuf n'a aucune raison d'ouvrir la boutique : tout y est payant, et
-- il faut une compète entière pour s'offrir le moins cher. Un objet gratuit
-- change ça — on entre, on porte quelque chose, on voit à quoi sert le reste.
-- Le filet est le bon candidat : un trait d'un pixel, il habille sans rien
-- promettre, et il ne dévalue aucun des cadres payants.
--
-- ─── Pourquoi rembourser ────────────────────────────────────────────────────
--
-- Quinze points, ce n'est pas grand-chose. Mais quelqu'un qui les a payés la
-- semaine dernière pour un objet devenu gratuit aujourd'hui a été puni d'avoir
-- joué tôt, et c'est exactement ce que le rééquilibrage du 31 août refusait de
-- faire. La règle vaut aussi pour un petit montant, sinon elle n'est pas une
-- règle.
--
-- On ne réécrit PAS l'achat : on ajoute une ligne de crédit. Le livre garde la
-- trace de ce qui s'est passé — un débit le jour de l'achat, un remboursement
-- le jour du changement — plutôt que de faire comme si l'objet avait toujours
-- été gratuit.
--
-- Le montant se lit sur la ligne réelle et non sur le prix affiché : une
-- promotion en cours a pu faire payer moins de quinze, et on ne rembourse
-- jamais plus que ce qui a été débité.
INSERT INTO "WalletEntry" (id, "userId", kind, amount, note, "createdAt")
SELECT
  gen_random_uuid()::text,
  w."userId",
  'GRANT',
  SUM(GREATEST(0, -w.amount))::int,
  'Le cadre Filet devient gratuit',
  now()
FROM "WalletEntry" w
WHERE w.kind = 'PURCHASE'
  AND w."itemId" = 'frame-filet'
GROUP BY w."userId"
HAVING SUM(GREATEST(0, -w.amount)) > 0
   -- Rejouable sans risque. Prisma ne rejoue pas une migration appliquée, mais
   -- ce fichier finira par être relancé à la main un jour — sur une base de
   -- test, pendant une restauration — et rembourser deux fois est une erreur
   -- qu'on ne remarque qu'au moment où quelqu'un s'achète tout le catalogue.
   AND NOT EXISTS (
     SELECT 1 FROM "WalletEntry" g
     WHERE g."userId" = w."userId"
       AND g.kind = 'GRANT'
       AND g.note = 'Le cadre Filet devient gratuit'
   );
