-- Le compteur de consultations.
--
-- Une ligne par visiteur, par cible et par JOURNÉE — pas par clic. Compter les
-- clics donnerait un nombre que n'importe qui fabrique en maintenant F5 : le
-- premier à s'en apercevoir aurait le profil le plus vu du site, et le chiffre
-- ne voudrait plus rien dire.
--
-- La cible est un joueur OU un artiste, jamais les deux. Deux colonnes
-- nullables plutôt que deux tables : les deux compteurs se lisent, s'écrivent
-- et se purgent exactement pareil, et les séparer aurait doublé le code pour
-- une distinction que seule la jointure connaît.

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "userId" TEXT,
    "artistId" TEXT,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- Les deux unicités cohabitent grâce aux NULL de PostgreSQL : deux NULL ne sont
-- jamais égaux, donc une vue d'artiste (userId NULL) échappe à la première et
-- une vue de joueur (artistId NULL) à la seconde. Le même mécanisme que
-- WalletEntry, déjà éprouvé.
CREATE UNIQUE INDEX "ProfileView_viewerId_userId_day_key" ON "ProfileView"("viewerId", "userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileView_viewerId_artistId_day_key" ON "ProfileView"("viewerId", "artistId", "day");

-- CreateIndex
--
-- Le comptage interroge par CIBLE et jamais par visiteur : ce sont ces deux
-- index-là qui portent la page, pas les unicités ci-dessus.
CREATE INDEX "ProfileView_userId_idx" ON "ProfileView"("userId");

-- CreateIndex
CREATE INDEX "ProfileView_artistId_idx" ON "ProfileView"("artistId");

-- AddForeignKey
--
-- Tout part en cascade : un compte supprimé ne doit laisser ni les vues qu'il a
-- faites, ni celles qu'il a reçues. C'est aussi ce que promet la page de
-- confidentialité.
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
