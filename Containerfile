# Maestro Chess Academy — all-in-one image (frontend build + Node server + Stockfish assets)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/public/vendor ./dist/vendor
EXPOSE 8080
CMD ["node", "server/index.mjs"]
