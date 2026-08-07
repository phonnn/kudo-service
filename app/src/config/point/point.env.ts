import { z } from 'zod';

export const pointEnvSchema = z.object({
  GIVING_BUDGET: z.coerce.number().int().positive().default(200),
});

export type PointEnv = z.infer<typeof pointEnvSchema>;
