-- Six cadres retirés du catalogue.
--
-- Les identifiants supprimés — creneaux, pistes, jury, scan, onde, glisse — ne
-- sont écrits nulle part ici. La condition porte sur les identifiants VIVANTS,
-- comme la migration du catalogue v2 : on n'a pas besoin de savoir ce qui
-- existait avant, seulement ce qui existe maintenant. La même requête
-- resservira telle quelle au prochain retrait.

-- 1. Rembourser.
--
-- Le porte-monnaie est un livre de comptes : supprimer une ligne de débit REND
-- les points, sans qu'aucun compteur n'ait à être touché.
DELETE FROM "WalletEntry"
WHERE kind = 'PURCHASE'
  AND "itemId" IS NOT NULL
  AND "itemId" NOT IN (
    'frame-filet', 'frame-equerres', 'frame-rivets', 'frame-grille',
    'frame-pellicule', 'frame-chevrons', 'frame-double', 'frame-vis',
    'frame-ruban', 'frame-cube', 'frame-tricolore', 'frame-cypher',
    'frame-cabine', 'frame-course', 'frame-rec', 'frame-braise',
    'frame-relais', 'frame-souffle', 'fx-underline', 'fx-chevrons',
    'fx-invert', 'fx-tall', 'fx-bullet', 'fx-spaced',
    'band-faders', 'band-skyline', 'band-film', 'band-cable',
    'band-blocks', 'band-curtain', 'band-vu', 'band-flags',
    'band-tape', 'band-cities', 'skin-teletext', 'skin-orange',
    'skin-graph', 'skin-amber', 'skin-negative', 'skin-cyan',
    'skin-phosphor', 'skin-gold', 'stamp-filed', 'stamp-noregret',
    'stamp-blind', 'stamp-rethink', 'stamp-bet', 'stamp-turning',
    'stamp-favourite', 'stamp-confirmed', 'stamp-first', 'stamp-tv'
  );

-- 2. Délier les cadres disparus.
--
-- Un equippedFrame qui pointe un cadre absent poserait une classe CSS qui
-- n'existe plus : pas de bordure du tout, sans erreur ni trace.
UPDATE "User"
SET "equippedFrame" = NULL
WHERE "equippedFrame" IS NOT NULL
  AND "equippedFrame" NOT IN (
    'frame-filet', 'frame-equerres', 'frame-rivets', 'frame-grille',
    'frame-pellicule', 'frame-chevrons', 'frame-double', 'frame-vis',
    'frame-ruban', 'frame-cube', 'frame-tricolore', 'frame-cypher',
    'frame-cabine', 'frame-course', 'frame-rec', 'frame-braise',
    'frame-relais', 'frame-souffle'
  );
