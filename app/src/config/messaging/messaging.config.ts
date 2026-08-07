import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MessagingConfig } from '@kudo/messaging';
import type { MessagingEnv } from './messaging.env';

@Injectable()
export class MessagingConfigService {
  constructor(
    private readonly configService: ConfigService<MessagingEnv, true>,
  ) {}

  getAll(): MessagingConfig {
    return {
      provider: 'redis',
      url: this.configService.get('MQ_URL', { infer: true }),
      stream: this.configService.get('MQ_STREAM', { infer: true }),
    };
  }
}
