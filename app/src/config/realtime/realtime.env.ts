import { z } from 'zod';

export const realtimeEnvSchema = z
  .object({
    REALTIME_PROVIDER: z.enum(['memory', 'redis']).default('memory'),
    REALTIME_REDIS_URL: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.REALTIME_PROVIDER === 'redis' && !env.REALTIME_REDIS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['REALTIME_REDIS_URL'],
        message: 'required when REALTIME_PROVIDER=redis',
      });
    }
  });

export type RealtimeEnv = z.infer<typeof realtimeEnvSchema>;
