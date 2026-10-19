
# dict-api for edis

## Description

An api, which consumes the pegelonline api and extends the stations with additional information.

## Installation

```bash
$ npm install
$ cp .env.example .env
```

The configuration is read from `.env`, which is not part of the repository. `.env.example` contains the defaults.

The enriched stations are stored in `stations.json` (`STATIONS_FILE_PATH`), which is also not part of the repository. Without it, the app starts without stations and fills them with the first harvest (`RUN_DATA_ENLARGING_ON_INIT`, `CRON_TIME_FOR_DATA_ENLARGING`).

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run build
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Docker

Build:

```bash
docker build -t dict-api .
```

Start:

```bash
docker run --rm -p 3000:3000 dict-api
```

The image contains `.env.example` as `.env` and no `stations.json`, so the stations are available after the first harvest. Single values can be overridden with `-e`. Inside the container, `localhost` refers to the container itself, so a Nominatim running on the host (e.g. via `docker/docker-compose.yml`) has to be passed like this:

```bash
docker run --rm -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e NOMINATIM_BASE_URL=http://host.docker.internal:9090/ \
  dict-api
```

Use and get a response:

http://localhost:3000/search?q=köln