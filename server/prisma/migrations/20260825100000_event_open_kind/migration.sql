-- ---------------------------------------------------------------------------
-- Le genre d'avis « les pronostics sont ouverts ».
--
-- Seul dans sa migration, volontairement. PostgreSQL autorise
-- `ALTER TYPE … ADD VALUE` dans une transaction depuis la version 12, mais
-- interdit d'UTILISER la nouvelle valeur dans la même transaction. La garder
-- isolée évite d'avoir à raisonner sur ce que Prisma regroupe : la migration
-- suivante peut s'en servir sans risque.
--
-- `IF NOT EXISTS` la rend rejouable sur une base déjà rattrapée à la main.
-- ---------------------------------------------------------------------------

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_OPEN';
