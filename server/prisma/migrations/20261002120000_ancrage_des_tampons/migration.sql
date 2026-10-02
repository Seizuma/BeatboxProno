-- Les tampons de groupe s'accrochent à un élément du pronostic, comme les
-- commentaires.
--
-- `x` et `y` étaient des fractions de la boîte de la fiche. Or la fiche se
-- réorganise avec la largeur de l'écran : un tampon posé sur une demi-finale
-- depuis un ordinateur atterrissait au milieu d'un classement sur téléphone.
-- La clé désigne l'élément visé, le décalage se mesure DANS sa boîte.
--
-- Facultatives : les tampons déjà posés n'ont pas d'ancre et gardent leurs
-- fractions, qui restent la position de repli.

ALTER TABLE "GroupStamp" ADD COLUMN "anchorKey" TEXT;
ALTER TABLE "GroupStamp" ADD COLUMN "anchorX" DOUBLE PRECISION;
ALTER TABLE "GroupStamp" ADD COLUMN "anchorY" DOUBLE PRECISION;
