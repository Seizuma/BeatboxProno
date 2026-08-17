# --- build ---
FROM node:20-alpine AS build
WORKDIR /app

# L'environnement applicatif doit être connu ICI, pas à l'exécution : Vite
# remplace les `import.meta.env.VITE_*` par leur valeur littérale pendant
# `npm run build`. Une variable passée au conteneur nginx arriverait trop tard,
# le paquet étant déjà écrit sur le disque.
ARG VITE_APP_ENV=prod
ENV VITE_APP_ENV=$VITE_APP_ENV

COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# --- runtime ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80