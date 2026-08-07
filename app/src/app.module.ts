import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfraModule } from './infra/infra.module';
import { PointModule } from './modules/point/point.module';
import { FeedModule } from './modules/feed';
import { NotificationModule } from './modules/notification';
import { RewardModule } from './modules/reward/reward.module';
import { UserModule } from './modules/user';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    InfraModule,
    FeedModule,
    NotificationModule,
    PointModule,
    RewardModule,
    UserModule,
    WorkersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
