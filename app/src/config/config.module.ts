import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import type { ZodTypeAny } from 'zod';
import { appEnvSchema, AppConfig } from './app';
import { databaseEnvSchema, DatabaseConfigService } from './database';
import { messagingEnvSchema, MessagingConfigService } from './messaging';
import { securityEnvSchema, SecurityConfigService } from './security';
import { storageEnvSchema, StorageConfigService } from './storage';

const envSchemas: ZodTypeAny[] = [
  appEnvSchema,
  databaseEnvSchema,
  messagingEnvSchema,
  securityEnvSchema,
  storageEnvSchema,
];

function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const parsed: Record<string, unknown> = {};

  for (const schema of envSchemas) {
    const result = schema.safeParse(config);
    if (!result.success) {
      errors.push(
        ...result.error.issues.map(
          (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
        ),
      );
      continue;
    }
    Object.assign(parsed, result.data as Record<string, unknown>);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
  }

  return parsed;
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
  providers: [
    AppConfig,
    DatabaseConfigService,
    MessagingConfigService,
    SecurityConfigService,
    StorageConfigService,
  ],
  exports: [
    AppConfig,
    DatabaseConfigService,
    MessagingConfigService,
    SecurityConfigService,
    StorageConfigService,
  ],
})
export class ConfigModule {}
