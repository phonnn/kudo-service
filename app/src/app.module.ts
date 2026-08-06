import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfraModule } from './infra/infra.module';
import { PointModule } from './modules/point/point.module';
import { FeedModule } from './modules/feed';
import { RewardModule } from './modules/reward/reward.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [InfraModule, FeedModule, PointModule, RewardModule, WorkersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
