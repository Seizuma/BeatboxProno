FROM node:20-alpine

# Prisma a besoin d'OpenSSL pour son moteur ; Alpine ne l'installe pas par
# défaut.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# On copie TOUT le code avant de générer le client Prisma.
#
# L'ordre inverse — générer, puis copier — laissait le `COPY . .` écraser le
# client fraîchement généré par le node_modules de la machine de développement,
# qui contient un client construit sur un ancien schéma. La base renvoyait alors
# des valeurs que le client ne connaissait pas (« Value 'OWNER' not found in
# enum 'Role' »). Le .dockerignore ci-joint règle la cause, ceci verrouille
# l'effet : le client est désormais toujours généré en dernier, sur le schéma
# réellement présent dans l'image.
COPY . .
RUN npx prisma generate

EXPOSE 4000
# Les migrations s'appliquent au démarrage : un déploiement = un git pull.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]