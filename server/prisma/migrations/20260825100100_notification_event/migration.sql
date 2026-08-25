-- ---------------------------------------------------------------------------
-- L'événement dont parle un avis.
--
-- Le modèle portait déjà `groupId` et `predictionId` : un avis qui annonce
-- l'ouverture d'une compétition a besoin de la désigner, sans quoi le clic ne
-- mène nulle part.
--
-- Nullable : la très grande majorité des avis ne concerne aucun événement.
-- `ON DELETE CASCADE` : supprimer une compétition doit emporter les avis qui y
-- renvoient, sinon la cloche proposerait des liens vers une page disparue.
--
-- L'index sert une seule question, mais elle tourne à chaque passage d'un
-- événement en pronostics ouverts : « cet événement a-t-il déjà été annoncé ? »
-- C'est cette requête d'existence qui empêche une seconde diffusion à tous les
-- comptes quand on repasse par OPEN après une correction de statut. On la
-- préfère à un drapeau sur l'événement, qui pourrait mentir si l'insertion des
-- avis avait échoué : ici, l'existence d'un avis EST la preuve de l'envoi.
-- ---------------------------------------------------------------------------

ALTER TABLE "Notification" ADD COLUMN "eventId" TEXT;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Notification_kind_eventId_idx" ON "Notification"("kind", "eventId");
