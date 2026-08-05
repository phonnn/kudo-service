import type { EventBus } from './interfaces/event-bus.interface';
import type { MessagingConfig } from './messaging.config';
import { RedisEventBus } from './providers/redis-event-bus.provider';

export function createMessaging(config: MessagingConfig): EventBus {
  switch (config.provider) {
    case 'redis':
      return new RedisEventBus(config);
  }
}
