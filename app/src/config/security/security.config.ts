import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SecurityConfig } from '@kudo/security';
import type { SecurityEnv } from './security.env';

@Injectable()
export class SecurityConfigService {
  constructor(
    private readonly configService: ConfigService<SecurityEnv, true>,
  ) {}

  getAll(): SecurityConfig {
    return {
      provider: 'local',
      accessTokenSecret: this.configService.get('AUTH_ACCESS_TOKEN_SECRET', {
        infer: true,
      }),
      accessTokenTtl: this.configService.get('AUTH_ACCESS_TOKEN_TTL', {
        infer: true,
      }),
      refreshTokenSecret: this.configService.get('AUTH_REFRESH_TOKEN_SECRET', {
        infer: true,
      }),
      refreshTokenTtl: this.configService.get('AUTH_REFRESH_TOKEN_TTL', {
        infer: true,
      }),
    };
  }
}
