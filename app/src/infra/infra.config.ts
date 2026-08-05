import type { MessagingConfig } from '@kudo/messaging';
import type { DatabaseConfig } from '@kudo/database';

export const databaseConfig: DatabaseConfig = {
  provider: 'postgres',
  url:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/kudos',
  poolSize: Number(process.env.DB_POOL_SIZE ?? 10),
};

export const messagingConfig: MessagingConfig = {
  provider: 'redis',
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  stream: process.env.REDIS_EVENT_STREAM ?? 'kudo:events',
};
