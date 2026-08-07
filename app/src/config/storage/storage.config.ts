import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageConfig } from '@kudo/storage';
import type { StorageEnv } from './storage.env';

@Injectable()
export class StorageConfigService {
  constructor(
    private readonly configService: ConfigService<StorageEnv, true>,
  ) {}

  getAll(): StorageConfig {
    return {
      provider: 's3',
      endpoint: this.configService.get('STORAGE_ENDPOINT', { infer: true }),
      bucket: this.configService.get('STORAGE_BUCKET', { infer: true }),
      region: this.configService.get('STORAGE_REGION', { infer: true }),
      accessKeyId: this.configService.get('STORAGE_ACCESS_KEY_ID', {
        infer: true,
      }),
      secretAccessKey: this.configService.get('STORAGE_SECRET_ACCESS_KEY', {
        infer: true,
      }),
    };
  }
}
