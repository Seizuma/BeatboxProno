-- Rôles, nombre de juges et date butoir des pronostics.
--
-- L'ordre compte : on convertit les modérateurs AVANT de retirer la valeur de
-- l'énumération, sinon PostgreSQL refuse de supprimer une valeur encore
-- utilisée par des lignes existantes.

-- 1. Les modérateurs deviennent administrateurs. Le rôle ne servait à rien de
--    plus qu'ADMIN en pratique, et le distinguer compliquait chaque contrôle.
UPDATE "User" SET "role" = 'ADMIN' WHERE "role" = 'MODERATOR';

-- 2. PostgreSQL ne sait pas retirer une valeur d'un enum : on reconstruit le
--    type, on bascule la colonne, on remplace l'ancien.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'OWNER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

DROP TYPE "Role_old";

-- 3. Le premier compte administrateur devient propriétaire. Il n'y en a qu'un,
--    et aucun administrateur ne pourra le destituer.
UPDATE "User"
SET "role" = 'OWNER'
WHERE "id" = (
  SELECT "id" FROM "User"
  WHERE "role" = 'ADMIN'
  ORDER BY "createdAt" ASC
  LIMIT 1
);

-- 4. Nombre de juges. Trois par défaut : le format le plus courant en beatbox.
ALTER TABLE "Event" ADD COLUMN "judgeCount" INTEGER NOT NULL DEFAULT 3;

-- Surcharge facultative au niveau d'une phase (finale à 5 juges).
ALTER TABLE "Phase" ADD COLUMN "judgeCount" INTEGER;

-- 5. Date butoir des pronostics. Nullable à dessein : une compète dont les
--    wildcards sont ouvertes mais dont la date n'est pas fixée n'a pas de
--    butoir, et ne doit pas en inventer un.
ALTER TABLE "Event" ADD COLUMN "predictionsCloseAt" TIMESTAMP(3);
