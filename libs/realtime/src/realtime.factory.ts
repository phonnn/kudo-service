import type { RealtimePush } from './interfaces/realtime-push.interface';
import type { RealtimeConfig } from './realtime.config';
import { InMemoryRealtimePush } from './providers/in-memory-realtime.provider';
import { RedisRealtimePush } from './providers/redis-realtime.provider';

export function createRealtimePush(config: RealtimeConfig): RealtimePush {
  switch (config.provider) {
    case 'memory':
      return new InMemoryRealtimePush();
    case 'redis':
      return new RedisRealtimePush(config);
  }
}
