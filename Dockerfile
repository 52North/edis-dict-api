FROM node:24.22.2-slim AS build

COPY . /src
WORKDIR /src

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:24.22.2-slim
COPY --from=build /src /src
WORKDIR /src
EXPOSE 3000
CMD [ "npm", "run", "start:prod" ]
