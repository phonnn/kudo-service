import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { OutboxModule } from '../outbox';
import { PointModule } from '../point/point.module';
import { RewardController } from './reward.controller';
import { RedeemRewardService } from './services/redeem-reward.service';
import { RedemptionRepository } from './repositories/redemption.repository';
import { RewardRepository } from './repositories/reward.repository';

@Module({
  imports: [InfraModule, OutboxModule, PointModule],
  controllers: [RewardController],
  providers: [RewardRepository, RedemptionRepository, RedeemRewardService],
  exports: [RewardRepository, RedemptionRepository, RedeemRewardService],
})
export class RewardModule {}
