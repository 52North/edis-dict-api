
# dict-api for edis

## Description

An api, which consumes the pegelonline api and extends the stations with additional information.

## Installation

Requires Node.js >= 24.22.2.

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
$ npm run start:prod
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

Use and get a response:

http://localhost:3000/search?q=köln