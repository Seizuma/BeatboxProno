-- ---------------------------------------------------------------------------
-- Les notifications.
--
-- Des lignes plutôt qu'un compteur : un compteur dirait « trois choses » sans
-- dire lesquelles, et repartirait faux au premier incident.
--
-- Cette migration suppose que celle du périmètre et des ancres est déjà
-- passée. Elle n'ajoute qu'une table et son type : rien d'existant n'est
-- modifié, aucune donnée n'est touchée.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('GROUP_JOIN', 'COMMENT_ON_MINE', 'COMMENT_REPLY');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "actorId" TEXT,
    "groupId" TEXT,
    "predictionId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- La seule requête qui compte : mes avis, du plus récent au plus ancien, avec
-- le décompte des non-lus. Ce décompte tourne à chaque chargement de page.
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL et non CASCADE : la suppression d'un compte ne doit pas emporter
-- les avis reçus par les autres. Ils restent lisibles, sans nom d'auteur.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
