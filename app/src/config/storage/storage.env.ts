import { z } from 'zod';

export const storageEnvSchema = z.object({
  STORAGE_ENDPOINT: z.string().min(1, 'STORAGE_ENDPOINT is required'),
  STORAGE_BUCKET: z.string().min(1, 'STORAGE_BUCKET is required'),
  STORAGE_REGION: z.string().min(1).default('us-east-1'),
  STORAGE_ACCESS_KEY_ID: z.string().min(1, 'STORAGE_ACCESS_KEY_ID is required'),
  STORAGE_SECRET_ACCESS_KEY: z
    .string()
    .min(1, 'STORAGE_SECRET_ACCESS_KEY is required'),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;
