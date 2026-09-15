-- Date de dépôt d'un pronostic, distincte de sa date de création.
--
-- `createdAt` date l'ouverture du brouillon. Un pronostic ouvert le 2 et déposé
-- le 15 portait la date du 2 : trié par `createdAt` décroissant et plafonné à
-- 200 lignes, l'écran de recherche admin ne montrait plus les dépôts récents.

ALTER TABLE "Prediction" ADD COLUMN "submittedAt" TIMESTAMP(3);

-- Reprise de l'existant. On ne connaît pas la vraie date de dépôt des lignes
-- déjà en base, il faut donc l'approcher :
--
--   * pronostic déposé mais PAS encore corrigé : `updatedAt` n'a été touché que
--     par les modifications de l'auteur et par le dépôt lui-même. C'est le
--     meilleur témoin disponible.
--   * pronostic déjà corrigé (`scoredAt` non nul) : `updatedAt` porte la date du
--     settlement, pas celle du dépôt. On retombe sur `createdAt`, qui n'est pas
--     juste mais reste dans le bon ordre relatif — c'est exactement l'ordre
--     affiché jusqu'ici, donc aucune régression sur l'historique.
--
-- Les brouillons gardent `NULL` : ils n'ont pas été déposés.
UPDATE "Prediction"
SET "submittedAt" = CASE
    WHEN "scoredAt" IS NULL THEN "updatedAt"
    ELSE "createdAt"
END
WHERE "submitted" = true;

CREATE INDEX "Prediction_submitted_submittedAt_idx"
    ON "Prediction" ("submitted", "submittedAt");
