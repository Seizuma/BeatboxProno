-- Revue de la boutique : neuf objets retirés, six ajoutés.
--
-- Retirés : les cadres Vis et Rivets, la bande Trois villes, et cinq tampons
-- (Ici ça bascule, Vu à la télé, Mon chouchou, À revoir, Première fois).
--
-- Deux objets CHANGENT sans être retirés : la bande Faders devient Lianes et le
-- cadre Pellicule devient Processeur. Leur identifiant ne bouge pas, donc ceux
-- qui les ont achetés les gardent — c'est une refonte du dessin, pas un nouvel
-- objet, et perdre un achat pour une décision d'affichage serait injuste.
--
-- La condition porte sur les identifiants VIVANTS, comme les migrations
-- précédentes : on n'a pas besoin de savoir ce qui existait avant, seulement ce
-- qui existe maintenant. La même requête resservira au prochain retrait.

-- 1. Rembourser.
--
-- Le porte-monnaie est un livre de comptes : supprimer une ligne de débit REND
-- les points, sans qu'aucun compteur n'ait à être touché.
DELETE FROM "WalletEntry"
WHERE kind = 'PURCHASE'
  AND "itemId" IS NOT NULL
  AND "itemId" NOT IN (
    'frame-filet', 'frame-equerres', 'frame-grille', 'frame-pellicule',
    'frame-chevrons', 'frame-double', 'frame-ruban', 'frame-cube',
    'frame-tricolore', 'frame-cypher', 'frame-coeurs', 'frame-fleurs',
    'frame-cabine', 'frame-course', 'frame-rgb', 'frame-rec',
    'frame-braise', 'frame-relais', 'frame-souffle', 'fx-underline',
    'fx-chevrons', 'fx-invert', 'fx-tall', 'fx-bullet',
    'fx-spaced', 'band-faders', 'band-skyline', 'band-film',
    'band-cable', 'band-blocks', 'band-missing', 'band-curtain',
    'band-vu', 'band-flags', 'band-tape', 'skin-teletext',
    'skin-orange', 'skin-graph', 'skin-amber', 'skin-negative',
    'skin-cyan', 'skin-phosphor', 'skin-gold', 'stamp-filed',
    'stamp-noregret', 'stamp-blind', 'stamp-bet', 'stamp-hearmeout',
    'stamp-what', 'stamp-confirmed'  );

-- 2. Délier les cadres disparus.
--
-- Un equippedFrame qui pointe un cadre absent poserait une classe CSS qui
-- n'existe plus : pas de bordure du tout, sans erreur ni trace.
UPDATE "User"
SET "equippedFrame" = NULL
WHERE "equippedFrame" IS NOT NULL
  AND "equippedFrame" NOT IN (
    'frame-filet', 'frame-equerres', 'frame-grille', 'frame-pellicule',
    'frame-chevrons', 'frame-double', 'frame-ruban', 'frame-cube',
    'frame-tricolore', 'frame-cypher', 'frame-coeurs', 'frame-fleurs',
    'frame-cabine', 'frame-course', 'frame-rgb', 'frame-rec',
    'frame-braise', 'frame-relais', 'frame-souffle'  );

-- 3. Délier les bandes disparues.
UPDATE "User"
SET "equippedBand" = NULL
WHERE "equippedBand" IS NOT NULL
  AND "equippedBand" NOT IN (
    'band-faders', 'band-skyline', 'band-film', 'band-cable',
    'band-blocks', 'band-missing', 'band-curtain', 'band-vu',
    'band-flags', 'band-tape'  );

-- 4. Délier les tampons disparus.
--
-- Et les retirer des pronostics où ils étaient posés : un tampon dont le
-- catalogue ne connaît plus l'identifiant ne se dessine pas, mais sa position
-- resterait inscrite en base et réapparaîtrait si l'identifiant était réutilisé.
UPDATE "User"
SET "equippedStamp" = NULL
WHERE "equippedStamp" IS NOT NULL
  AND "equippedStamp" NOT IN (
    'stamp-filed', 'stamp-noregret', 'stamp-blind', 'stamp-bet',
    'stamp-hearmeout', 'stamp-what', 'stamp-confirmed'  );

UPDATE "Prediction"
SET stamp = NULL
WHERE stamp IS NOT NULL
  AND stamp->>'id' NOT IN (
    'stamp-filed', 'stamp-noregret', 'stamp-blind', 'stamp-bet',
    'stamp-hearmeout', 'stamp-what', 'stamp-confirmed'  );
