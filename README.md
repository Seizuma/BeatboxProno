# Pronos Beatbox

Site de pronostics pour les compétitions de beatbox : classements de wildcards,
arbres de battles, top 4, classement des pronostiqueurs. Connexion par Discord,
back-office pour saisir les résultats.

React + Vite · Node + Express + Prisma · PostgreSQL · Docker

---

## Ce que fait le site

**Côté public** — un événement expose ses catégories (Solo, Tag Team, Loopstation,
Crew, Legacy). Chacune enchaîne des phases : classement à composer pour les
wildcards et les éliminations, arbre à remplir pour les brackets, top 4 final.
Les choix de l'utilisateur se propagent automatiquement d'un tour au suivant :
désigner un vainqueur en quart le place en demi-finale.

**Côté admin** — création des événements et des artistes, saisie des résultats,
attribution des rôles. Chaque résultat publié relance immédiatement le calcul des
scores de tous les pronostics concernés.

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
l'officiel les fait se croiser dans l'autre moitié du tableau.

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
https://pronos.mondomaine.fr/api/auth/discord/callback
```

En local, ajoutez aussi `http://localhost:5173/api/auth/discord/callback`.
Seul le scope `identify` est demandé.

---

## Déployer sur le VPS OVH

```bash
git clone git@github.com:VOTRE-COMPTE/VOTRE-REPO.git pronos
cd pronos
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
| Domain Names | `pronos.mondomaine.fr` |
| Scheme | `http` |
| Forward Hostname / IP | `127.0.0.1` (ou le nom du conteneur si NPM est sur le même réseau Docker) |
| Forward Port | `8080` |
| Websockets Support | activé |
| SSL | certificat Let's Encrypt + *Force SSL* |

Si NPM tourne lui-même dans Docker, `127.0.0.1` désigne son propre conteneur.
Rattachez-le au réseau du projet et pointez sur `web:80` :

```bash
docker network connect pronos_default nginx-proxy-manager
```

Le nginx interne du conteneur `web` sert les fichiers statiques et relaie `/api/`
vers l'API : un seul domaine, donc pas de CORS ni de cookie tiers à gérer.

### Mise à jour

```bash
git pull && docker compose up -d --build
```

Les migrations Prisma s'appliquent au démarrage de l'API (`prisma migrate deploy`).

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

Le sélecteur en haut à droite bascule entre les trois. Une fois votre choix
arrêté, fixez `data-theme` dans `web/index.html` et supprimez le composant
`ThemeSwitcher` dans `web/src/components/Layout.jsx`.

---

## Structure

```
server/
  prisma/schema.prisma      modèle de données
  prisma/seed.js            jeu de démonstration
  src/lib/scoring.js        barème (pur, testé)
  src/lib/auth.js           OAuth2 Discord + session JWT en cookie httpOnly
  src/routes/               auth · public · predictions · admin
web/
  src/styles/themes.css     les trois directions esthétiques
  src/components/           RankingBoard · BracketBoard · Layout
  src/pages/                Home · EventPage · Leaderboard · Profile · Artists · Admin
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
  dans `Prediction.breakdown`, il ne reste qu'à l'afficher.

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
