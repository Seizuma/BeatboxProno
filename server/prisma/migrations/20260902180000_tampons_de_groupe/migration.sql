-- Les tampons de groupe.
--
-- Chacun peut poser SON tampon sur le pronostic d'un autre membre. C'est un
-- geste social, pas une annotation : un tampon ne dit rien de précis, il dit
-- « je suis passé et j'en pense quelque chose ».
--
-- ─── Un seul tampon par personne et par pronostic ──────────────────────────
--
-- L'unicité est la règle qui donne son sens au geste. Sans elle, un membre
-- pourrait couvrir un pronostic de vingt tampons et le rendre illisible ; avec
-- elle, un mur de tampons est un mur de signatures, une par personne.
--
-- La reposer déplace le tampon plutôt que d'en ajouter un — c'est un upsert
-- côté serveur, et c'est aussi ce que le joueur attend en cliquant ailleurs.
--
-- ─── Pourquoi le groupe fait partie de la clé ──────────────────────────────
--
-- Un même pronostic peut être visible dans deux groupes dont on est membre. Les
-- tampons n'y sont pas les mêmes : ce qu'on pose entre amis n'a pas à suivre
-- dans un autre cercle. C'est la même logique que les commentaires.

-- CreateTable
CREATE TABLE "GroupStamp" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    -- L'identifiant du catalogue. Sans clé étrangère : le catalogue vit dans le
    -- code, et un tampon retiré doit laisser la ligne mourir de sa belle mort
    -- plutôt que d'empêcher une suppression.
    "itemId" TEXT NOT NULL,

    -- En FRACTIONS de la fiche, jamais en pixels : la carte n'a pas la même
    -- largeur sur un téléphone et sur un écran large.
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupStamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupStamp_groupId_predictionId_authorId_key"
    ON "GroupStamp"("groupId", "predictionId", "authorId");

-- CreateIndex
--
-- La lecture demande toujours « les tampons de CE pronostic dans CE groupe » :
-- c'est cet index qui porte l'ouverture d'une fiche.
CREATE INDEX "GroupStamp_groupId_predictionId_idx" ON "GroupStamp"("groupId", "predictionId");

-- AddForeignKey
--
-- Tout part en cascade. Dissoudre un groupe efface ses tampons comme ses
-- commentaires : c'est la conversation qui disparaît, pas les pronostics.
ALTER TABLE "GroupStamp" ADD CONSTRAINT "GroupStamp_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupStamp" ADD CONSTRAINT "GroupStamp_predictionId_fkey"
    FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupStamp" ADD CONSTRAINT "GroupStamp_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
