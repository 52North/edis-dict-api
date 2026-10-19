FROM node:24-slim AS build

WORKDIR /src

# xlsx is installed from the tarball in vendor
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim

WORKDIR /app
# the harvest writes stations.json via a temporary file in this directory
RUN chown node:node /app

COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY package.json .env stations.json einzugsgebiete.geojson Suchwortliste-Dict-API_v0-1_2022-06-23.xlsx ./

USER node
EXPOSE 3000
# started via npm, so that npm_package_version is set for the swagger docs
CMD [ "npm", "run", "start:prod" ]
