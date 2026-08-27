-- Catalogue cosmétique v2 : cinq emplacements au lieu de trois.
--
-- Les titres et les pins ont été retirés du catalogue. Trois conséquences, et
-- l'ordre compte : on rembourse AVANT de supprimer les colonnes, sinon on perd
-- la trace de ce que les gens portaient.
--
-- Les valeurs de l'énumération BadgeCode ne bougent PAS. BRONZE, SILVER et GOLD
-- restent les identifiants techniques des trois paliers : retirer une valeur
-- d'un type énuméré PostgreSQL demande de réécrire la colonne et tous ses
-- index. Seuls les libellés affichés changent, et ils vivent dans le
-- dictionnaire, pas ici.

-- 1. Rembourser les achats devenus caducs.
--
-- Le porte-monnaie est un livre de comptes : supprimer une ligne de débit REND
-- les points, sans qu'aucun compteur n'ait à être touché. C'est exactement le
-- cas pour lequel le ledger avait été choisi contre un compteur sur User.
--
-- La condition porte sur les identifiants VIVANTS et non sur les anciens : on
-- n'a pas besoin de savoir ce qui existait avant, seulement ce qui existe
-- maintenant. Le jour où un autre objet disparaîtra, cette même requête le
-- remboursera sans être modifiée.
DELETE FROM "WalletEntry"
WHERE kind = 'PURCHASE'
  AND "itemId" IS NOT NULL
  AND "itemId" NOT IN (
    'frame-filet', 'frame-rec', 'frame-track', 'frame-clock',
    'frame-countdown', 'frame-wave', 'frame-helix', 'frame-ants',
    'frame-vu', 'frame-ovation', 'frame-cube', 'frame-tricolore',
    'frame-champion', 'frame-scan', 'fx-underline', 'fx-chevrons',
    'fx-invert', 'fx-tall', 'fx-bullet', 'fx-spaced',
    'band-faders', 'band-skyline', 'band-film', 'band-cable',
    'band-blocks', 'band-curtain', 'band-vu', 'band-flags',
    'band-tape', 'band-cities', 'skin-teletext', 'skin-orange',
    'skin-graph', 'skin-amber', 'skin-negative', 'skin-cyan',
    'skin-phosphor', 'skin-gold', 'stamp-filed', 'stamp-noregret',
    'stamp-blind', 'stamp-rethink', 'stamp-bet', 'stamp-turning',
    'stamp-favourite', 'stamp-confirmed', 'stamp-first', 'stamp-tv'
  );

-- 2. Délier les cadres qui n'existent plus.
--
-- equippedFrame survit au changement de catalogue, mais cinq cadres de la
-- première version ont disparu. Les laisser en place afficherait une classe CSS
-- absente : pas de bordure du tout, sans erreur ni trace.
UPDATE "User"
SET "equippedFrame" = NULL
WHERE "equippedFrame" IS NOT NULL
  AND "equippedFrame" NOT IN (
    'frame-filet', 'frame-rec', 'frame-track', 'frame-clock',
    'frame-countdown', 'frame-wave', 'frame-helix', 'frame-ants',
    'frame-vu', 'frame-ovation', 'frame-cube', 'frame-tricolore',
    'frame-champion', 'frame-scan'
  );

-- 3. Les emplacements.
ALTER TABLE "User" DROP COLUMN "equippedTitle";
ALTER TABLE "User" DROP COLUMN "equippedFlair";
ALTER TABLE "User" ADD COLUMN     "equippedNameFx" TEXT;
ALTER TABLE "User" ADD COLUMN     "equippedBand" TEXT;
ALTER TABLE "User" ADD COLUMN     "equippedCardSkin" TEXT;
ALTER TABLE "User" ADD COLUMN     "equippedStamp" TEXT;
