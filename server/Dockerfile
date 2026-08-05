FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 4000
# Les migrations s'appliquent au démarrage : un déploiement = un git pull.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
