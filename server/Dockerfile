FROM node:20-alpine

# Prisma a besoin d'OpenSSL pour son moteur ; Alpine ne l'installe pas par
# défaut. Sans ça, le moteur Prisma répond des erreurs illisibles au démarrage
# au lieu de simplement fonctionner.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 4000
# Les migrations s'appliquent au démarrage : un déploiement = un git pull.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
