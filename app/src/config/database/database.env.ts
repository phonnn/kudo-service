import { z } from 'zod';

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
