import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatabaseConfig } from '@kudo/database';
import type { DatabaseEnv } from './database.env';

@Injectable()
export class DatabaseConfigService {
  constructor(
    private readonly configService: ConfigService<DatabaseEnv, true>,
  ) {}

  getAll(): DatabaseConfig {
    return {
      provider: 'postgres',
      url: this.configService.get('DATABASE_URL', { infer: true }),
      poolSize: this.configService.get('DB_POOL_SIZE', { infer: true }),
    };
  }
}
