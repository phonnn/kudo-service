# kudo-service

A peer-recognition/rewards platform API (NestJS + Kysely/Postgres + Redis Streams), built as a Yarn Berry workspace (`app/` + `libs/*`).

For the design decisions behind this (data model, transaction boundaries, real-time feed, layering, trade-offs), see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Corepack](https://nodejs.org/api/corepack.html) (ships with Node 16.10+) — this project uses **Yarn Berry**, not classic Yarn. Run `corepack enable` once per machine so `yarn` resolves to the right version automatically.
- [Docker](https://www.docker.com/) — for the local Postgres/Redis/MinIO stack.

## Install

```bash
corepack enable
yarn install
```

## Environment

```bash
cp .env.example .env
```

Defaults in `.env.example` line up with the backing services below, so nothing else needs to change for local dev.

## Start backing services

```bash
docker compose up -d
```

Starts Postgres, Redis, and MinIO (see `docker-compose.yml`). Add `--profile tools` to also start pgAdmin/RedisInsight.

## Run database migrations

```bash
yarn migrate:latest
```

## Run locally

```bash
yarn start:dev
```

Server listens on `http://localhost:3000` by default (`PORT` env var to override).

## Test

```bash
# unit tests
yarn test

# unit tests, watch mode
yarn test:watch

# unit test coverage
yarn test:cov

# end-to-end tests (needs the backing services running + migrations applied)
yarn test:e2e
```

## Lint & format

```bash
yarn lint    # eslint --fix
yarn format  # prettier --write
```

## Build

```bash
yarn build   # compiles to dist/
```

## CI

`.github/workflows/ci.yml` runs install, lint, unit tests, e2e tests, and a build check on every push and pull request to `master`.
