-- Revue de la boutique : deux bandes retirées.
--
-- Gratte-ciel et Bande magnétique s'en vont. Le reste de la revue ne touche
-- aucun identifiant : les tampons changent de COULEUR, « Hear me out » garde son
-- anglicisme en français, et les cadres changent de dessin. Personne ne perd
-- donc rien de ce qu'il a acheté sur ces objets-là.
--
-- La condition porte sur les identifiants VIVANTS, comme les migrations
-- précédentes : on n'a pas besoin de savoir ce qui existait avant, seulement ce
-- qui existe maintenant.

-- 1. Rembourser.
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
    'fx-spaced', 'band-faders', 'band-film', 'band-cable',
    'band-blocks', 'band-missing', 'band-curtain', 'band-vu',
    'band-flags', 'skin-teletext', 'skin-orange', 'skin-graph',
    'skin-amber', 'skin-negative', 'skin-cyan', 'skin-phosphor',
    'skin-gold', 'stamp-filed', 'stamp-noregret', 'stamp-blind',
    'stamp-bet', 'stamp-hearmeout', 'stamp-what', 'stamp-confirmed'  );

-- 2. Délier les bandes disparues.
--
-- Un equippedBand qui pointe une bande absente ne dessine rien : le profil
-- perdrait ses colonnes sans erreur ni trace, et son propriétaire croirait à un
-- bogue plutôt qu'à un retrait.
UPDATE "User"
SET "equippedBand" = NULL
WHERE "equippedBand" IS NOT NULL
  AND "equippedBand" NOT IN (
    'band-faders', 'band-film', 'band-cable', 'band-blocks',
    'band-missing', 'band-curtain', 'band-vu', 'band-flags'  );
