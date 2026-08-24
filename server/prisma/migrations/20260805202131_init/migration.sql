-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'OPEN', 'LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('SOLO', 'TAG_TEAM', 'LOOPSTATION', 'CREW', 'LEGACY');

-- CreateEnum
CREATE TYPE "PhaseType" AS ENUM ('SEEDING', 'WILDCARD', 'ELIMINATION', 'BRACKET', 'LEGACY');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('ROUND_OF_16', 'QUARTER', 'SEMI', 'SMALL_FINAL', 'FINAL', 'LEGACY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "globalName" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "location" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "coverUrl" TEXT,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contender" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seed" INTEGER,
    "wildcard" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,

    CONSTRAINT "Contender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContenderArtist" (
    "contenderId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,

    CONSTRAINT "ContenderArtist_pkey" PRIMARY KEY ("contenderId","artistId")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "PhaseType" NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "qualifierCount" INTEGER,
    "locksAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseEntry" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "contenderId" TEXT NOT NULL,
    "rank" INTEGER,
    "qualified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PhaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "round" "RoundType" NOT NULL,
    "slot" INTEGER NOT NULL,
    "label" TEXT,
    "contenderAId" TEXT,
    "contenderBId" TEXT,
    "winnerId" TEXT,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "played" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodiumSlot" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "contenderId" TEXT NOT NULL,

    CONSTRAINT "PodiumSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictedRank" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "contenderId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "PredictedRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictedBattle" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "round" "RoundType" NOT NULL,
    "slot" INTEGER NOT NULL,
    "contenderAId" TEXT,
    "contenderBId" TEXT,
    "winnerId" TEXT,
    "scoreA" INTEGER,
    "scoreB" INTEGER,

    CONSTRAINT "PredictedBattle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictedPodium" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "contenderId" TEXT NOT NULL,

    CONSTRAINT "PredictedPodium_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_eventId_slug_key" ON "Category"("eventId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseEntry_phaseId_contenderId_key" ON "PhaseEntry"("phaseId", "contenderId");

-- CreateIndex
CREATE UNIQUE INDEX "Battle_phaseId_round_slot_key" ON "Battle"("phaseId", "round", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "PodiumSlot_categoryId_rank_key" ON "PodiumSlot"("categoryId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_userId_categoryId_key" ON "Prediction"("userId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictedRank_predictionId_phaseId_contenderId_key" ON "PredictedRank"("predictionId", "phaseId", "contenderId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictedBattle_predictionId_phaseId_round_slot_key" ON "PredictedBattle"("predictionId", "phaseId", "round", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "PredictedPodium_predictionId_rank_key" ON "PredictedPodium"("predictionId", "rank");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contender" ADD CONSTRAINT "Contender_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContenderArtist" ADD CONSTRAINT "ContenderArtist_contenderId_fkey" FOREIGN KEY ("contenderId") REFERENCES "Contender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContenderArtist" ADD CONSTRAINT "ContenderArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseEntry" ADD CONSTRAINT "PhaseEntry_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseEntry" ADD CONSTRAINT "PhaseEntry_contenderId_fkey" FOREIGN KEY ("contenderId") REFERENCES "Contender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_contenderAId_fkey" FOREIGN KEY ("contenderAId") REFERENCES "Contender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_contenderBId_fkey" FOREIGN KEY ("contenderBId") REFERENCES "Contender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Contender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodiumSlot" ADD CONSTRAINT "PodiumSlot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodiumSlot" ADD CONSTRAINT "PodiumSlot_contenderId_fkey" FOREIGN KEY ("contenderId") REFERENCES "Contender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedRank" ADD CONSTRAINT "PredictedRank_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedRank" ADD CONSTRAINT "PredictedRank_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedRank" ADD CONSTRAINT "PredictedRank_contenderId_fkey" FOREIGN KEY ("contenderId") REFERENCES "Contender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedBattle" ADD CONSTRAINT "PredictedBattle_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedBattle" ADD CONSTRAINT "PredictedBattle_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedBattle" ADD CONSTRAINT "PredictedBattle_contenderAId_fkey" FOREIGN KEY ("contenderAId") REFERENCES "Contender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedBattle" ADD CONSTRAINT "PredictedBattle_contenderBId_fkey" FOREIGN KEY ("contenderBId") REFERENCES "Contender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedBattle" ADD CONSTRAINT "PredictedBattle_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Contender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedPodium" ADD CONSTRAINT "PredictedPodium_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictedPodium" ADD CONSTRAINT "PredictedPodium_contenderId_fkey" FOREIGN KEY ("contenderId") REFERENCES "Contender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
