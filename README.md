
# dict-api for edis

## Description

An api, which consumes the pegelonline api and extends the stations with additional information.

## Installation

```bash
$ npm install
```

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

The image contains the `.env` of the repository. Single values can be overridden with `-e`. Inside the container, `localhost` refers to the container itself, so a Nominatim running on the host (e.g. via `docker/docker-compose.yml`) has to be passed like this:

```bash
docker run --rm -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e NOMINATIM_BASE_URL=http://host.docker.internal:9090/ \
  dict-api
```

Use and get a response:

http://localhost:3000/search?q=köln