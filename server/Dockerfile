FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# npm ci exige un package-lock.json. Committez-le pour des builds reproductibles ;
# sans lui, on retombe sur npm install.
RUN npm ci --omit=dev || npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# migrate deploy applique les migrations avant de démarrer l'API
CMD ["npm", "start"]
