import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfraModule } from './infra/infra.module';
import { PointModule } from './modules/point/point.module';
import { FeedModule } from './modules/feed';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [InfraModule, FeedModule, PointModule, WorkersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
