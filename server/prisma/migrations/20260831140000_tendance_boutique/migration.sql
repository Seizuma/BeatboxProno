-- La tendance de la boutique et ses promotions.
--
-- Deux tables minuscules, remplacées en bloc à chaque recalcul plutôt que mises
-- à jour ligne à ligne : il n'y a rien à conserver d'un classement périmé, et un
-- `deleteMany` suivi d'un `createMany` dans une transaction est à la fois plus
-- simple et plus sûr qu'une réconciliation.
--
-- Aucune clé étrangère vers un catalogue : le catalogue vit dans le code. Un
-- objet retiré laisse une ligne orpheline que le prochain calcul balaiera, et
-- l'affichage ignore ce qu'il ne reconnaît pas.

-- CreateTable
--
-- `computedAt` porte l'horloge des deux jours. C'est la DATE du dernier calcul
-- qui décide du prochain, jamais une planification « tous les deux jours » —
-- celle-ci dérive au premier redémarrage tombant un jour impair.
CREATE TABLE "ShopTrend" (
    "itemId" TEXT NOT NULL,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopTrend_pkey" PRIMARY KEY ("itemId")
);

-- CreateIndex
CREATE INDEX "ShopTrend_position_idx" ON "ShopTrend"("position");

-- CreateTable
CREATE TABLE "ShopPromo" (
    "itemId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPromo_pkey" PRIMARY KEY ("itemId")
);

-- CreateIndex
--
-- La lecture filtre toujours sur « encore valable » : c'est cet index qui porte
-- chaque ouverture de la boutique.
CREATE INDEX "ShopPromo_endsAt_idx" ON "ShopPromo"("endsAt");
