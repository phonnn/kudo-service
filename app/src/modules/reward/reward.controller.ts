import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { RedeemRewardService } from './services/redeem-reward.service';
import {
  RedemptionHistoryService,
  type RedemptionHistoryPage,
} from './services/redemption-history.service';
import { ListRedemptionsQueryDto } from './dto/list-redemptions-query.dto';
import { InvalidCursorError } from './errors/invalid-cursor.error';
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
    private readonly redemptionHistory: RedemptionHistoryService,
  ) {}

  @Get()
  list(): Promise<RewardListItem[]> {
    return this.rewards.listActive();
  }

  @Get('redemptions')
  async listMyRedemptions(
    @Query() query: ListRedemptionsQueryDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<RedemptionHistoryPage> {
    try {
      return await this.redemptionHistory.listHistory(
        principal.subject,
        query.limit,
        query.cursor,
      );
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
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
