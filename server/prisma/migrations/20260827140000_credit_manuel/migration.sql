-- Le crédit manuel.
--
-- Une troisième nature d'écriture, et deux colonnes de provenance.
--
-- Un crédit d'événement se justifie tout seul : il porte l'identifiant de la
-- compète. Un crédit manuel ne porte rien. Le jour où quelqu'un demande d'où
-- viennent ses cinq cents points, sans motif ni auteur la seule réponse
-- possible est « je ne sais pas ».

-- AlterEnum
--
-- Ajouter une valeur est trivial ; en retirer une ne l'est pas — il faut
-- réécrire le type, la colonne et ses index. C'est la raison pour laquelle on
-- ne renomme jamais une valeur d'énumération dans ce projet, GRANT compris.
ALTER TYPE "WalletKind" ADD VALUE IF NOT EXISTS 'GRANT';

-- AlterTable
--
-- `grantedById` sans clé étrangère : la ligne doit survivre à la suppression du
-- compte administrateur qui l'a créée. Une cascade effacerait des points
-- légitimes parce qu'un organisateur a fermé son compte, et un SET NULL sur une
-- relation demanderait une seconde relation sur User pour un identifiant qu'on
-- n'interroge jamais dans l'autre sens.
ALTER TABLE "WalletEntry" ADD COLUMN     "note" TEXT,
ADD COLUMN     "grantedById" TEXT;
