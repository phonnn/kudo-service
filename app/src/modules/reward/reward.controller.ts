import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { RedeemRewardService } from './services/redeem-reward.service';
import {
  RewardRepository,
  type RewardListItem,
} from './repositories/reward.repository';

@UseGuards(AuthGuard)
@Controller('rewards')
export class RewardController {
  constructor(
    private readonly rewards: RewardRepository,
    private readonly redeemRewardService: RedeemRewardService,
  ) {}

  @Get()
  list(): Promise<RewardListItem[]> {
    return this.rewards.listActive();
  }

  @Post(':id/redeem')
  redeem(
    @Param('id', ParseUUIDPipe) rewardId: string,
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('idempotency-key header is required');
    return this.redeemRewardService.redeemReward({
      userId: principal.subject,
      rewardId,
      idempotencyKey,
    });
  }
}
