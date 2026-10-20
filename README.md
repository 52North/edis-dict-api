
# dict-api for edis

## Description

An api, which consumes the pegelonline api and extends the stations with additional information.

## Installation

```bash
$ npm install
$ cp .env.example .env
```

The configuration is read from `.env`, which is not part of the repository. `.env.example` contains the defaults. The app does not start without valid http(s) urls in `PEGELONLINE_BASE_URL` and `NOMINATIM_BASE_URL`, the trailing `/` of `NOMINATIM_BASE_URL` is optional.

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

## Nominatim

The harvest gets the address of each station (country, state, county, city) by reverse geocoding with Nominatim (`NOMINATIM_BASE_URL`). `docker/docker-compose.yml` runs a local instance with the OpenStreetMap extract of Germany on port 9090, which matches `.env.example`:

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f
```

The first start imports the extract, which takes several hours. The instance is ready when the log shows `Nominatim is ready to accept requests`. It only answers reverse requests and gets no updates. For newer data, remove the container and its volume with `docker compose -f docker/docker-compose.yml down -v` and start again.

If geocoding fails for a station, the harvest keeps its previous address. To check the addresses after a harvest, copy `stations.json` beforehand and compare:

```bash
cp stations.json stations.before.json
# run a harvest, e.g. start the app with RUN_DATA_ENLARGING_ON_INIT=true
npm run compare-stations -- stations.before.json stations.json
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