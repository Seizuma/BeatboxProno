-- CreateTable
CREATE TABLE "Visit" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "Visit_day_idx" ON "Visit"("day");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Amorce : User.lastSeenAt ne retient que la dernière visite, mais elle est
-- vraie. On en fait le premier point de la courbe plutôt que de démarrer à
-- zéro. Les jours antérieurs restent inconnus — ils le sont réellement.
INSERT INTO "Visit" ("userId", "day", "seenAt")
SELECT "id", to_char("lastSeenAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD'), "lastSeenAt"
FROM "User"
ON CONFLICT DO NOTHING;
