import { z } from 'zod';

export const securityEnvSchema = z.object({
  AUTH_ACCESS_TOKEN_SECRET: z
    .string()
    .min(1, 'AUTH_ACCESS_TOKEN_SECRET is required'),
  AUTH_ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
  AUTH_REFRESH_TOKEN_SECRET: z
    .string()
    .min(1, 'AUTH_REFRESH_TOKEN_SECRET is required'),
  AUTH_REFRESH_TOKEN_TTL: z.string().min(1).default('7d'),
});

export type SecurityEnv = z.infer<typeof securityEnvSchema>;
