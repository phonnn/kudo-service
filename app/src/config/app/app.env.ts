import { z } from 'zod';

export const appEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_NAME: z.coerce.string(),
  PORT: z.coerce.number().int().positive().default(3000),
  // Comma-separated list of allowed CORS origins.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3001,http://127.0.0.1:3001')
    .transform((value) => value.split(',').map((origin) => origin.trim())),
});

export type AppEnv = z.infer<typeof appEnvSchema>;
