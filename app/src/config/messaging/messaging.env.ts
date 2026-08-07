import { z } from 'zod';

export const messagingEnvSchema = z.object({
  MQ_URL: z.string().min(1, 'MQ_URL is required'),
  MQ_STREAM: z.string().min(1).default('kudo:events'),
});

export type MessagingEnv = z.infer<typeof messagingEnvSchema>;
