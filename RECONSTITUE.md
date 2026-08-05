# Fichiers reconstitués — à comparer avant d'écraser

La copie du projet dont je disposais était partielle : quatre fichiers n'y
figuraient pas. Je les ai réécrits pour que le dépôt soit complet et démarre,
mais **si vous avez toujours vos versions d'origine, gardez-les**. Comparez, ne
remplacez qu'après lecture.

| Fichier | Comment il a été reconstitué | Risque |
| --- | --- | --- |
| `server/src/lib/auth.js` | À partir de ses appelants : `routes/auth.js` en attendait `discordAuthorizeUrl`, `exchangeCode`, `upsertDiscordUser`, `issueSession`, `clearSession` ; `predictions.js` `requireAuth` ; `admin.js` `requireRole` ; `index.js` `attachUser`. | **Élevé.** Nom du cookie, durée de session et logique de promotion admin sont mes choix, pas forcément les vôtres. |
| `server/package.json` | Dépendances déduites des `import` du code serveur. `jsonwebtoken` est supposé (la session est un JWT en cookie). | Moyen : vérifiez les versions contre votre `package-lock.json`. |
| `server/Dockerfile` | Calqué sur `web/Dockerfile` et sur ce que le README décrit (`prisma migrate deploy` au démarrage). | Faible. |
| `.env.example` | Reconstruit depuis les variables lues par le code et par `docker-compose.yml`. | Faible. Contient la nouvelle variable `ARTIST_PHOTOS_HOST_DIR`. |

Tout le reste du dépôt vient soit de votre code d'origine, soit des fichiers
écrits pour cette mise à jour.
