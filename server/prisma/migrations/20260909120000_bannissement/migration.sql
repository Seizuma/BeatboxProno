-- Le bannissement d'un compte.
--
-- Deux gestes distincts existent désormais côté administration, et ils ne se
-- remplacent pas :
--
--   — BANNIR ferme la porte. Le compte reste en base, ses pronostics déposés
--     restent au classement. Les effacer réécrirait le palmarès de tous les
--     autres joueurs, qui n'ont rien fait. C'est réversible.
--
--   — SUPPRIMER emporte tout, exactement comme la suppression volontaire de
--     la page de profil : cascade complète, groupes transmis au plus ancien
--     membre restant. Ce n'est pas réversible et ne demande aucune colonne.
--
-- D'où une seule migration, et seulement pour le premier.
--
-- Une DATE plutôt qu'un booléen : « depuis quand » est la première question
-- posée quand quelqu'un conteste, et un booléen doublé d'une date finit
-- toujours par se contredire — c'est celui qu'on ne lit pas qui a raison.
--
-- Nullable sans valeur par défaut : NULL dit « ce compte n'a jamais été
-- banni » mieux qu'une date sentinelle, et les comptes existants n'ont rien à
-- rétro-remplir.
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);

-- Le motif ne sort jamais vers le compte banni : la page de connexion dit que
-- c'est fermé, pas pourquoi. Il sert à l'administration, qui doit pouvoir
-- répondre à « pourquoi ? » six mois plus tard sans se fier à sa mémoire.
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;

-- L'index sert la seule requête qui filtre là-dessus : la liste des comptes
-- bannis dans l'onglet Comptes. Partiel, parce que la quasi-totalité des
-- lignes ont NULL et qu'un index plein les porterait toutes pour rien.
CREATE INDEX "User_bannedAt_idx" ON "User"("bannedAt") WHERE "bannedAt" IS NOT NULL;
