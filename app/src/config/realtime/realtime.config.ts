import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RealtimeConfig } from '@kudo/realtime';
import type { RealtimeEnv } from './realtime.env';

function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`${key} is required but was not set`);
  }
  return value;
}

@Injectable()
export class RealtimeConfigService {
  constructor(
    private readonly configService: ConfigService<RealtimeEnv, true>,
  ) {}

  getAll(): RealtimeConfig {
    const provider = this.configService.get('REALTIME_PROVIDER', {
      infer: true,
    });

    if (provider === 'redis') {
      return {
        provider: 'redis',
        url: requireEnv(
          this.configService.get('REALTIME_REDIS_URL', { infer: true }),
          'REALTIME_REDIS_URL',
        ),
      };
    }

    return { provider: 'memory' };
  }
}
