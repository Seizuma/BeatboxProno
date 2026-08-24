-- ---------------------------------------------------------------------------
-- Groupes privés : cercles, appartenances, commentaires.
--
-- Migration écrite à la main. Le contenu correspond exactement à ce que
-- `prisma migrate diff` produit pour ces trois modèles, plus l'index partiel
-- de la dernière section, que Prisma ne sait pas décrire dans le schéma.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "inviteOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "GroupComment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "GroupComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE INDEX "GroupComment_groupId_predictionId_createdAt_idx" ON "GroupComment"("groupId", "predictionId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupComment_authorId_idx" ON "GroupComment"("authorId");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupComment" ADD CONSTRAINT "GroupComment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupComment" ADD CONSTRAINT "GroupComment_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupComment" ADD CONSTRAINT "GroupComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Un seul propriétaire par groupe.
--
-- Prisma ne sait pas décrire un index partiel dans le schéma : sans cette
-- contrainte, deux lignes OWNER pourraient coexister sur le même groupe — un
-- transfert interrompu à mi-chemin, deux requêtes concurrentes — et plus rien
-- ne dirait qui décide. C'est le même mécanisme que l'unicité du pronostic
-- déposé, et il doit survivre aux migrations suivantes.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "GroupMember_one_owner_per_group"
  ON "GroupMember" ("groupId")
  WHERE "role" = 'OWNER';
