FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
COPY libs/database/package.json ./libs/database/package.json
COPY libs/messaging/package.json ./libs/messaging/package.json
COPY libs/realtime/package.json ./libs/realtime/package.json
COPY libs/security/package.json ./libs/security/package.json
COPY libs/storage/package.json ./libs/storage/package.json
RUN yarn install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
COPY libs/database/package.json ./libs/database/package.json
COPY libs/messaging/package.json ./libs/messaging/package.json
COPY libs/realtime/package.json ./libs/realtime/package.json
COPY libs/security/package.json ./libs/security/package.json
COPY libs/storage/package.json ./libs/storage/package.json
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=build /app/dist ./dist
COPY kysely.config.ts ./
COPY app/src/migrations ./app/src/migrations

EXPOSE 3000
CMD ["sh", "-c", "yarn migrate:latest && node dist/app/src/main.js"]
