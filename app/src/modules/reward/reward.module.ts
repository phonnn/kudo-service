import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { RewardController } from './reward.controller';
import { RedeemRewardService } from './services/redeem-reward.service';
import { RedemptionHistoryService } from './services/redemption-history.service';
import { RedemptionRepository } from './repositories/redemption.repository';
import { RewardRepository } from './repositories/reward.repository';
import { REWARD_REDEMPTION_PORT } from './interfaces/reward-redemption-port.interface';

@Module({
  imports: [InfraModule],
  controllers: [RewardController],
  providers: [
    RewardRepository,
    RedemptionRepository,
    { provide: REWARD_REDEMPTION_PORT, useExisting: RedemptionRepository },
    RedeemRewardService,
    RedemptionHistoryService,
  ],
  exports: [RewardRepository, RedemptionRepository, RedeemRewardService],
})
export class RewardModule {}
