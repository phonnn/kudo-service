import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from './app.env';

@Injectable()
export class AppConfig {
  constructor(private readonly configService: ConfigService<AppEnv, true>) {}

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get appName(): string {
    return this.configService.get('APP_NAME', { infer: true });
  }

  get port(): number {
    return this.configService.get('PORT', { infer: true });
  }
}
