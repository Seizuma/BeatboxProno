-- Badges d'événement et porte-monnaie de boutique.
--
-- Migration écrite à la main plutôt que générée : le schéma était déjà poussé
-- sans son dossier `migrations/`, et `migrate deploy` n'applique QUE des
-- fichiers existants — il ne lit jamais schema.prisma. D'où « Database schema
-- is up to date » en face d'une colonne manquante.
--
-- Aucune donnée existante n'est touchée : trois colonnes nullables sur User,
-- deux tables neuves, deux types énumérés. Rejouable sur prod telle quelle.

-- CreateEnum
CREATE TYPE "BadgeCode" AS ENUM ('PARTICIPANT', 'BRONZE', 'SILVER', 'GOLD', 'PODIUM_3', 'PODIUM_2', 'PODIUM_1');

-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('EVENT_POINTS', 'PURCHASE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "equippedFrame" TEXT,
ADD COLUMN     "equippedTitle" TEXT,
ADD COLUMN     "equippedFlair" TEXT;

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" "BadgeCode" NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WalletKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "eventId" TEXT,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BadgeAward_userId_idx" ON "BadgeAward"("userId");

-- CreateIndex
CREATE INDEX "BadgeAward_eventId_idx" ON "BadgeAward"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_userId_eventId_code_key" ON "BadgeAward"("userId", "eventId", "code");

-- CreateIndex
CREATE INDEX "WalletEntry_userId_idx" ON "WalletEntry"("userId");

-- Les deux unicités cohabitent grâce aux NULL de PostgreSQL : deux NULL ne
-- sont jamais égaux, donc les achats (eventId NULL) échappent à la première et
-- les crédits (itemId NULL) à la seconde.
-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_userId_eventId_key" ON "WalletEntry"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_userId_itemId_key" ON "WalletEntry"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supprimer une vieille compète ne doit pas reprendre un argent peut-être déjà
-- dépensé : SET NULL, jamais CASCADE, sous peine de soldes négatifs.
-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
