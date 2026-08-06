import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { RedeemRewardService } from './services/redeem-reward.service';
@Controller('rewards')
export class RewardController {
  constructor(private readonly redeemRewardService: RedeemRewardService) {}
  @Post(':id/redeem')
  redeem(
    @Param('id') rewardId: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    if (!idempotencyKey)
      throw new BadRequestException('idempotency-key header is required');
    return this.redeemRewardService.redeemReward({
      userId,
      rewardId,
      idempotencyKey,
    });
  }
}
