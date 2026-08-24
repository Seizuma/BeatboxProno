-- ---------------------------------------------------------------------------
-- Périmètre du groupe, et ancrage des commentaires.
--
-- Deux ajouts indépendants réunis dans une seule migration parce qu'ils
-- arrivent ensemble : le périmètre décide de ce qui est commentable, et les
-- ancres décident d'où. L'un sans l'autre laisserait l'interface à moitié
-- fonctionnelle.
--
-- Rien n'est détruit ici : les trois colonnes ajoutées sont nullables, les
-- commentaires déjà écrits restent valides et deviennent des commentaires
-- généraux, sans ancre.
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "GroupEvent" (
    "groupId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupEvent_pkey" PRIMARY KEY ("groupId","eventId")
);

-- CreateIndex
CREATE INDEX "GroupEvent_eventId_idx" ON "GroupEvent"("eventId");

-- AddForeignKey
ALTER TABLE "GroupEvent" ADD CONSTRAINT "GroupEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEvent" ADD CONSTRAINT "GroupEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "GroupComment" ADD COLUMN     "anchorKey" TEXT,
ADD COLUMN     "anchorX" DOUBLE PRECISION,
ADD COLUMN     "anchorY" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- Les groupes existants n'ont aucun événement, donc aucun périmètre.
--
-- Volontaire : mieux vaut un groupe vide qui demande à son propriétaire de
-- choisir qu'un groupe qui décide tout seul de suivre l'intégralité du site.
-- Rien à rattraper en préproduction, où les groupes sont des essais.
-- ---------------------------------------------------------------------------
