import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PointEnv } from './point.env';

@Injectable()
export class PointConfig {
  constructor(private readonly configService: ConfigService<PointEnv, true>) {}

  get givingBudget(): number {
    return this.configService.get('GIVING_BUDGET', { infer: true });
  }
}
