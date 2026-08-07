# kudo-service

A NestJS API service.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Yarn](https://yarnpkg.com/) (classic, v1)

## Install

```bash
yarn install
```

## Run locally

```bash
# watch mode (recommended for local dev)
yarn start:dev

# without file watching
yarn start

# production mode (requires `yarn build` first)
yarn start:prod
```

The server listens on `http://localhost:3000` by default (override with the `PORT` env var).

## Test

```bash
# unit tests
yarn test

# unit tests, watch mode
yarn test:watch

# unit test coverage
yarn test:cov

# end-to-end tests
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

## Docker

Build and run the production image locally:

```bash
docker build -t kudo-service .
docker run -p 3000:3000 kudo-service
```

## CI

`.github/workflows/ci.yml` runs install, lint, unit tests, e2e tests, and a build check on every push and pull request to `master`.
