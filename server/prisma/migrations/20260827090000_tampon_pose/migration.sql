-- La pose du tampon.
--
-- Une colonne JSON et non trois colonnes séparées : la position d'un tampon est
-- un tout — retrouver un `stampX` sans son `stampY` n'aurait aucun sens, et la
-- base n'a rien à interroger là-dedans. Même choix que `seedPairs` sur Phase,
-- pour la même raison.
--
-- Nullable et sans valeur par défaut : l'immense majorité des pronostics n'aura
-- jamais de tampon, et `NULL` dit exactement cela.
ALTER TABLE "Prediction" ADD COLUMN "stamp" JSONB;
