import { z } from 'zod';

export const appEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_NAME: z.coerce.string(),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type AppEnv = z.infer<typeof appEnvSchema>;
