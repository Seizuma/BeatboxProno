# beatboxpredictions

Site de pronostics pour les compétitions de beatbox : classements de wildcards,
arbres de battles, top 4, classement et statistiques des pronostiqueurs.
Connexion par Discord, back-office pour saisir les résultats.

React + Vite · Node + Express + Prisma · PostgreSQL · Docker

Interface en anglais par défaut, en français si le navigateur le demande.

---

## Ce que fait le site

**Côté public** — un événement expose ses catégories (Solo, Tag Team, Loopstation,
Crew, Legacy). Chacune enchaîne des phases : classement à composer pour les
wildcards et les éliminations, arbre à remplir pour les brackets, top 4 final.
Les choix de l'utilisateur se propagent automatiquement d'un tour au suivant :
désigner un vainqueur en quart le place en demi-finale.

Le classement se compose au glisser-déposer, à la souris comme au doigt. L'arbre
se lit en pyramide, chaque affiche placée à mi-hauteur des deux qui l'alimentent.

**Côté admin** — création des événements et des artistes, rattachement des photos,
saisie des résultats, attribution des rôles. Chaque résultat publié relance
immédiatement le calcul des scores de tous les pronostics concernés.

---

## Barème

Tout le barème vit dans un seul fichier : `server/src/lib/scoring.js`, couvert par
`server/src/lib/scoring.test.js`. Si vous ajustez les règles, c'est le seul endroit
à toucher.

| Contexte | Règle |
| --- | --- |
| Wildcards, éliminations | +1 par contender dont la qualification est bien prédite |
| Wildcards, éliminations, seeding | +1 à +5 selon l'écart de placement (écart 0 → 5 pts, écart 4 → 1 pt, au-delà → 0) |
| Seeding | uniquement les points d'écart |
| Battles | +2 si l'affiche a eu lieu, même à un autre endroit du tour |
| Battles | +2 pour le bon vainqueur |
| Battles | +2 pour le bon score |
| Top 4 final | 5 / 4 / 3 / 2 points, soit 14 pour un top 4 parfait |

Le point « l'affiche a eu lieu » est comparé sur la paire de contenders, sans tenir
compte de l'ordre ni du slot : prédire *Alem vs NaPoM* en demi-finale paie même si
l'officiel les fait se croiser dans l'autre moitié du tableau. La page de
statistiques applique la même règle pour calculer la réussite en battle.

```bash
cd server && npm test
```

---

## Démarrer en local

```bash
cp .env.example .env      # renseignez au minimum JWT_SECRET
docker compose up -d db

cd server
npm install
npx prisma migrate dev --name init
npm run seed              # un GBB 2026 de démonstration, 5 catégories
npm run dev               # API sur :4000

cd ../web
npm install
npm run dev               # site sur :5173, proxy /api vers :4000
```

Le tout premier compte Discord qui se connecte devient administrateur.

### Application Discord

Sur <https://discord.com/developers/applications> : nouvelle application, onglet
**OAuth2**. Récupérez `CLIENT ID` et `CLIENT SECRET`, puis ajoutez l'URL de
redirection — elle doit correspondre exactement à `DISCORD_REDIRECT_URI` :

```
https://predictions.mondomaine.fr/api/auth/discord/callback
```

En local, ajoutez aussi `http://localhost:5173/api/auth/discord/callback`.
Seul le scope `identify` est demandé.

---

## Les photos des artistes

Elles vivent dans un autre projet du VPS (`Beatbox-Games/server/beatbox_artists`).
Le dossier est monté **en lecture seule** dans le conteneur `api` : ce projet ne
peut rien y écrire, il se contente de lire et d'enregistrer le chemin public dans
`Artist.imageUrl`.

Dans `.env` :

```bash
ARTIST_PHOTOS_HOST_DIR=/chemin/absolu/vers/Beatbox-Games/server/beatbox_artists
```

Puis l'appariement, en ligne de commande :

```bash
docker compose exec api node scripts/link-artist-photos.js          # aperçu
docker compose exec api node scripts/link-artist-photos.js --apply  # écrit
```

… ou depuis l'onglet **Artistes** de l'administration, qui affiche le même
rapport et propose un bouton.

Le nom du fichier est comparé au `slug` de l'artiste, à son nom et à ses alias,
accents, casse et séparateurs ignorés : `Alem_FR.jpg`, `alem.png` et `Alem.webp`
tombent tous sur l'artiste `alem`. Le rapport liste ce qui n'a pas été apparié
dans les deux sens — pour rattraper un cas isolé, ajoutez le nom du fichier comme
alias de l'artiste, ou appelez `PUT /api/admin/photos/<id>` avec `{ "file": "…" }`.

Les images sont servies sous `/api/media/artists/…`, donc par le proxy existant :
aucune règle nginx supplémentaire.

---

## Déployer sur le VPS OVH

```bash
git clone git@github.com:VOTRE-COMPTE/VOTRE-REPO.git predictions
cd predictions
cp .env.example .env && nano .env
docker compose up -d --build
```

Trois conteneurs démarrent : `db`, `api`, `web`. Seul `web` publie un port, et
uniquement sur la boucle locale (`127.0.0.1:8080`) : rien n'est joignable depuis
l'extérieur sans passer par le proxy.

### Nginx Proxy Manager

Nouveau *Proxy Host* :

| Champ | Valeur |
| --- | --- |
| Domain Names | `predictions.mondomaine.fr` |
| Scheme | `http` |
| Forward Hostname / IP | `127.0.0.1` (ou le nom du conteneur si NPM est sur le même réseau Docker) |
| Forward Port | `8080` |
| Websockets Support | activé |
| SSL | certificat Let's Encrypt + *Force SSL* |

Si NPM tourne lui-même dans Docker, `127.0.0.1` désigne son propre conteneur.
Rattachez-le au réseau du projet et pointez sur `web:80` :

```bash
docker network connect predictions_default nginx-proxy-manager
```

Le nginx interne du conteneur `web` sert les fichiers statiques et relaie `/api/`
vers l'API : un seul domaine, donc pas de CORS ni de cookie tiers à gérer.

### Mise à jour

```bash
git pull && docker compose up -d --build
```

Les migrations Prisma s'appliquent au démarrage de l'API (`prisma migrate deploy`).

---

## Langue

L'anglais est la langue du site. On bascule en français uniquement si
`navigator.languages` contient un tag français. Un sélecteur EN/FR dans
l'en-tête permet de forcer l'un ou l'autre ; le choix est mémorisé et gagne sur
le navigateur.

Tous les libellés du site public vivent dans `web/src/lib/i18n.jsx`, deux
dictionnaires à plat. Ajouter une langue : ajouter une entrée dans `LANGS` et un
dictionnaire. L'administration, réservée au staff, est restée en français.

Les adresses sont anglaises — `/events/:slug`, `/leaderboard`, `/stats`,
`/artists`, `/me`, `/players/:id` — et les anciennes adresses françaises
redirigent, pour ne pas casser les liens déjà partagés.

---

## Choisir l'identité visuelle

Trois directions complètes sont livrées, chacune décrite en tokens dans
`web/src/styles/themes.css` :

- **Fiche** — la feuille de notation du juge : papier gris-vert, réglure bleue,
  tampon rouge, scores en machine à écrire.
- **Loop** — la face avant d'une loopstation : panneau graphite mat, sérigraphie
  crème, laiton et vert d'écran. Les choix s'allument comme des pads.
- **Affiche** — le placard collé avant la compète : outremer et ocre sur papier
  os, noms en très gros, aplats sans ombre.

`data-theme` est fixé sur `loop` dans `web/index.html`. Les feuilles de style ne
connaissent que les variables : changer d'identité, c'est changer cet attribut.

---

## Structure

```
server/
  prisma/schema.prisma      modèle de données
  prisma/seed.js            jeu de démonstration
  scripts/link-artist-photos.js   appariement des photos, en CLI
  src/lib/scoring.js        barème (pur, testé)
  src/lib/auth.js           OAuth2 Discord + session JWT en cookie httpOnly
  src/lib/photos.js         lecture du dossier de photos, appariement
  src/routes/               auth · public · stats · predictions · admin · photos
web/
  src/lib/i18n.jsx          dictionnaires EN/FR, détection du navigateur
  src/styles/themes.css     les trois directions esthétiques
  src/styles/board.css      géométrie de l'arbre, cartes de glisser-déposer
  src/components/           RankingBoard · BracketBoard · Layout · ArtistFigure
  src/pages/                Home · EventPage · Leaderboard · PlayerStats ·
                            Profile · Artists · Admin
```

---

## Ce qui reste à faire

- Formulaires d'administration pour les catégories, participants et phases : l'API
  existe (`POST /api/admin/categories/:id/contenders`, etc.), l'interface passe
  aujourd'hui par le script de seed.
- Rôle Discord comme condition d'accès (exige le scope `guilds.members.read`).
- Fermeture automatique des phases par tâche planifiée — pour l'instant `locksAt`
  est vérifié à l'enregistrement.
- Page de détail d'un pronostic scoré : le détail ligne à ligne est déjà stocké
  dans `Prediction.breakdown`, il ne reste qu'à l'afficher sur `/players/:id`.
- Traduction de l'administration, si elle doit sortir du cercle francophone.

---

## Première installation : générer la migration

Le dépôt ne contient pas de dossier `prisma/migrations`. Il faut le créer **une
seule fois**, puis le committer : ensuite, chaque déploiement applique les
migrations tout seul au démarrage de l'API.

```bash
docker compose up -d db          # la base seule

cd server
npm install                      # génère aussi package-lock.json
DATABASE_URL="postgresql://bbp:VOTRE_MDP@127.0.0.1:5432/bbp?schema=public" \
  npx prisma migrate dev --name init

cd ..
git add server/package-lock.json web/package-lock.json server/prisma/migrations
git commit -m "Ajout des lockfiles et de la migration initiale"

docker compose up -d --build     # le reste de la pile
```

Remplacez `VOTRE_MDP` par le `POSTGRES_PASSWORD` de votre `.env`.
