import type { Storage } from './interfaces/storage.interface';
import type { StorageConfig } from './storage.config';
import { S3Storage } from './providers/s3-storage.provider';

export function createStorage(config: StorageConfig): Storage {
  switch (config.provider) {
    case 's3':
      return new S3Storage(config);
  }
}
