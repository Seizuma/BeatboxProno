-- Rééquilibrage des prix de la boutique.
--
-- Le catalogue passe de 12 660 à 2 660 points. Une compète du GBB rapporte au
-- mieux 360 points, 175 en moyenne : à l'ancien barème il fallait une saison
-- entière pour s'offrir un seul cadre, et la boutique ne récompensait rien.
--
-- ─── Pourquoi rembourser le trop-perçu ─────────────────────────────────────
--
-- Quelqu'un qui a payé 420 points un cadre qui en vaut 130 aujourd'hui a payé
-- le prix fort pour avoir joué tôt. Ne rien faire punirait précisément les
-- premiers à avoir soutenu la boutique.
--
-- On ne réécrit PAS les achats : on ajoute une ligne de crédit égale à la
-- différence. Le livre garde ainsi la trace de ce qui s'est passé — un débit de
-- 420 le jour de l'achat, un remboursement le jour du changement de barème —
-- plutôt que de faire comme si le prix avait toujours été de 130.
--
-- La différence se calcule à l'exécution depuis les lignes réelles : la requête
-- reste juste quel que soit le montant payé, promotion comprise, et ne rembourse
-- jamais plus que ce qui a été débité.

CREATE TEMP TABLE nouveau_prix ("itemId" TEXT PRIMARY KEY, prix INTEGER NOT NULL);
INSERT INTO nouveau_prix VALUES
  ('frame-filet', 15),
  ('frame-equerres', 25),
  ('frame-rivets', 45),
  ('frame-grille', 45),
  ('frame-pellicule', 50),
  ('frame-chevrons', 55),
  ('frame-double', 30),
  ('frame-vis', 70),
  ('frame-ruban', 50),
  ('frame-cube', 75),
  ('frame-tricolore', 60),
  ('frame-cypher', 55),
  ('frame-cabine', 60),
  ('frame-course', 130),
  ('frame-rec', 100),
  ('frame-braise', 130),
  ('frame-relais', 150),
  ('frame-souffle', 90),
  ('fx-underline', 20),
  ('fx-chevrons', 35),
  ('fx-invert', 50),
  ('fx-tall', 60),
  ('fx-bullet', 25),
  ('fx-spaced', 30),
  ('band-faders', 60),
  ('band-skyline', 70),
  ('band-film', 55),
  ('band-cable', 45),
  ('band-blocks', 65),
  ('band-curtain', 80),
  ('band-vu', 60),
  ('band-flags', 90),
  ('band-tape', 50),
  ('band-cities', 110),
  ('skin-teletext', 0),
  ('skin-orange', 20),
  ('skin-graph', 20),
  ('skin-amber', 15),
  ('skin-negative', 15),
  ('skin-cyan', 15),
  ('skin-phosphor', 15),
  ('skin-gold', 25),
  ('stamp-filed', 20),
  ('stamp-noregret', 40),
  ('stamp-blind', 40),
  ('stamp-rethink', 30),
  ('stamp-bet', 60),
  ('stamp-turning', 50),
  ('stamp-favourite', 35),
  ('stamp-confirmed', 75),
  ('stamp-first', 0),
  ('stamp-tv', 45);
-- Une seule écriture par joueur : un relevé lisible plutôt qu'une ligne par
-- objet, qui noierait le livre de comptes sous cinquante remboursements.
INSERT INTO "WalletEntry" (id, "userId", kind, amount, note, "createdAt")
SELECT
  gen_random_uuid()::text,
  w."userId",
  'GRANT',
  SUM(GREATEST(0, (-w.amount) - n.prix))::int,
  'Rééquilibrage des prix de la boutique',
  now()
FROM "WalletEntry" w
JOIN nouveau_prix n ON n."itemId" = w."itemId"
WHERE w.kind = 'PURCHASE'
GROUP BY w."userId"
-- Personne ne reçoit une ligne à zéro : qui n'a rien acheté, ou n'a acheté que
-- des objets déjà au bon prix, n'a rien à voir apparaître.
HAVING SUM(GREATEST(0, (-w.amount) - n.prix)) > 0
   -- Rejouable sans risque. Prisma ne rejoue pas une migration appliquée, mais
   -- ce fichier finira par être relancé à la main un jour — sur une base de
   -- test, pendant une restauration — et rembourser deux fois est une erreur
   -- qu'on ne remarque qu'au moment où quelqu'un s'achète tout le catalogue.
   AND NOT EXISTS (
     SELECT 1 FROM "WalletEntry" g
     WHERE g."userId" = w."userId"
       AND g.kind = 'GRANT'
       AND g.note = 'Rééquilibrage des prix de la boutique'
   );

DROP TABLE nouveau_prix;
