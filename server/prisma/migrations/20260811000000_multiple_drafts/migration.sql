-- Brouillons multiples, un seul pronostic déposé.
--
-- Jusqu'ici, une contrainte d'unicité sur (userId, categoryId) autorisait un
-- seul pronostic par personne et par catégorie : enregistrer un brouillon
-- écrasait le précédent. On la lève, et on la remplace par une règle plus
-- fine — autant de brouillons qu'on veut (dix, plafonnés côté API), mais un
-- seul déposé.

-- 1. Le nom que la personne donne à sa version.
ALTER TABLE "Prediction" ADD COLUMN "label" TEXT;

-- 2. On lève l'unicité stricte. Prisma nomme ses contraintes d'après la table
--    et les colonnes ; le nom peut différer selon la version qui a créé la
--    migration initiale, d'où la recherche dynamique plutôt qu'un DROP en dur.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = '"Prediction"'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "Prediction" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Certaines versions de Prisma créent un index unique plutôt qu'une contrainte.
DROP INDEX IF EXISTS "Prediction_userId_categoryId_key";

-- 3. La nouvelle règle : un seul pronostic DÉPOSÉ par personne et par
--    catégorie. Les brouillons ne sont pas concernés — c'est tout l'intérêt
--    d'un index partiel. La base garantit ainsi l'invariant même si un jour
--    l'API se trompe.
CREATE UNIQUE INDEX "Prediction_one_submitted_per_category"
  ON "Prediction" ("userId", "categoryId")
  WHERE "submitted";

-- 4. Index de lecture : on liste sans cesse les pronostics d'une personne sur
--    une catégorie, et les pronostics déposés d'une catégorie au recalcul.
CREATE INDEX "Prediction_userId_categoryId_idx" ON "Prediction" ("userId", "categoryId");
CREATE INDEX "Prediction_categoryId_submitted_idx" ON "Prediction" ("categoryId", "submitted");

-- 5. Les pronostics existants deviennent la version « Pronostic principal ».
UPDATE "Prediction" SET "label" = 'Pronostic principal' WHERE "label" IS NULL;
