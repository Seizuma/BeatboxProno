-- Types d'artistes, et noms de participants qui suivent l'artiste.

-- 1. Les formats dans lesquels un artiste se produit. Une liste et non une
--    valeur unique : un beatboxer peut concourir en solo et faire partie d'un
--    crew.
CREATE TYPE "ArtistKind" AS ENUM ('SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'PRODUCER');
ALTER TABLE "Artist" ADD COLUMN "kinds" "ArtistKind"[] DEFAULT ARRAY[]::"ArtistKind"[];

-- Amorçage : on déduit le type des catégories où chaque artiste est déjà
-- engagé. Rien d'irréversible, la liste reste modifiable depuis l'admin.
UPDATE "Artist" a
SET "kinds" = sub.kinds
FROM (
  SELECT ca."artistId",
         array_agg(DISTINCT cat."kind"::text::"ArtistKind") AS kinds
  FROM "ContenderArtist" ca
  JOIN "Contender" c ON c."id" = ca."contenderId"
  JOIN "Category" cat ON cat."id" = c."categoryId"
  WHERE cat."kind"::text IN ('SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW')
  GROUP BY ca."artistId"
) sub
WHERE a."id" = sub."artistId";

-- 2. Le nom d'un participant devient facultatif.
--
--    Jusqu'ici il était recopié depuis l'artiste au moment de l'engagement :
--    renommer l'artiste ensuite ne changeait rien nulle part, et surtout pas
--    dans les pronostics déjà déposés. Vide, le nom suit désormais l'artiste
--    rattaché — la correction se propage partout, rétroactivement.
ALTER TABLE "Contender" ALTER COLUMN "name" DROP NOT NULL;

-- 3. On efface les noms qui ne faisaient que recopier l'artiste unique du
--    participant : ceux-là suivront désormais. Les noms de duos et de crews,
--    qui n'appartiennent à aucun artiste isolé, sont conservés.
UPDATE "Contender" c
SET "name" = NULL
WHERE EXISTS (
  SELECT 1
  FROM "ContenderArtist" ca
  JOIN "Artist" a ON a."id" = ca."artistId"
  WHERE ca."contenderId" = c."id"
    AND a."name" = c."name"
  GROUP BY ca."contenderId"
  HAVING count(*) = 1
);
