-- CreateEnum
CREATE TYPE "PostboxKind" AS ENUM ('SUGGESTION', 'BUG');

-- CreateTable
CREATE TABLE "PostboxMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PostboxKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "failure" TEXT,

    CONSTRAINT "PostboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostboxMessage_userId_createdAt_idx" ON "PostboxMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostboxMessage_delivered_createdAt_idx" ON "PostboxMessage"("delivered", "createdAt");

-- AddForeignKey
ALTER TABLE "PostboxMessage" ADD CONSTRAINT "PostboxMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
