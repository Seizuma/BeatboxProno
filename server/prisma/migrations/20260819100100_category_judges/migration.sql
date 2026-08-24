-- ---------------------------------------------------------------------------
-- Le jury d'une catégorie.
--
-- Un tableau de chaînes plutôt qu'une relation vers Artist : un jury comprend
-- régulièrement des gens qui ne concourent nulle part — des beatboxers
-- retirés, des invités d'une autre discipline. Les faire entrer au référentiel
-- pour les citer une fois polluerait la page Artistes et fausserait ses
-- statistiques.
--
-- Par catégorie et non par événement : une même compétition juge rarement le
-- Solo et le Loopstation avec le même panel.
--
-- Colonne NON NULLE avec tableau vide par défaut : les catégories existantes
-- s'y conforment sans écriture, et le code n'a jamais à distinguer « pas de
-- jury » de « jury inconnu ». Un `judges` nullable aurait imposé un `?? []` à
-- chaque lecture, et il aurait fini par manquer quelque part.
-- ---------------------------------------------------------------------------

ALTER TABLE "Category" ADD COLUMN "judges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
