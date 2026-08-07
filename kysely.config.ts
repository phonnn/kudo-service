import 'dotenv/config';
import { defineConfig, getKnexTimestampPrefix } from 'kysely-ctl';
import { Pool } from 'pg';

export default defineConfig({
  dialect: 'pg',
  dialectConfig: {
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.DB_POOL_SIZE ? Number(process.env.DB_POOL_SIZE) : 10,
    }),
  },
  migrations: {
    migrationFolder: 'app/src/migrations',
    getMigrationPrefix: getKnexTimestampPrefix,
  },
});
