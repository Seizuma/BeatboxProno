-- Séparer les badges des crédits, et rattacher les badges à un jeu de dessins.
--
-- ─── Deux réglages là où il n'y en avait qu'un ──────────────────────────────
--
-- `awardsBadges` commandait les DEUX distributions : les médailles et le crédit
-- du porte-monnaie. Refuser les médailles d'une compète revenait donc à lui
-- refuser aussi ses points de boutique, ce que personne ne veut — un
-- championnat peut parfaitement rapporter des points sans décerner les
-- médailles d'une autre compétition.
--
-- ─── Un identifiant de jeu plutôt qu'un booléen ─────────────────────────────
--
-- Un booléen ne savait dire que « des badges » ou « pas de badges », et les
-- badges étaient forcément les mêmes partout : sept dessins pour tout le site.
-- Une sélection de wildcards à vingt joueurs décernait donc les médailles du
-- Grand Beatbox Battle.
--
-- La colonne désigne maintenant une FAMILLE de dessins. NULL = aucune médaille.
-- « gbb » = les cubes actuels. Une famille dessinée plus tard s'ajoute au
-- registre côté client et devient sélectionnable, sans migration.
--
-- Volontairement du TEXT et pas une énumération : le catalogue des dessins vit
-- dans le client, et le graver ici imposerait une migration par famille.
--
-- ─── La reprise préserve l'état exact ───────────────────────────────────────
--
-- Une compète qui décernait un palmarès reçoit « gbb », les seuls dessins qui
-- existent aujourd'hui ; une compète décochée reste à NULL. Personne ne gagne
-- ni ne perd de médaille au passage de cette migration.
ALTER TABLE "Event" ADD COLUMN "badgeSet" TEXT;
ALTER TABLE "Event" ADD COLUMN "awardsCredits" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Event" SET "badgeSet" = 'gbb' WHERE "awardsBadges" = true;

ALTER TABLE "Event" DROP COLUMN "awardsBadges";
