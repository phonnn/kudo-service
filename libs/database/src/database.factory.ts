import type { Database } from './interfaces/database.interface';
import type { DatabaseConfig } from './database.config';
import { PostgresDatabase } from './providers/postgres-database.provider';

export function createDatabase(config: DatabaseConfig): Database {
  switch (config.provider) {
    case 'postgres':
      return new PostgresDatabase(config);
  }
}
