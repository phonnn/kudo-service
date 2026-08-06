import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { OutboxModule } from '../outbox';
import { PointModule } from '../point/point.module';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { KudoReservationFailedListener } from './listeners/kudo-reservation-failed.listener';
import { FeedController } from './controllers/feed.controller';
import { MediaController } from './controllers/media.controller';
import { FeedMediaRepository } from './repositories/feed-media.repository';
import { FeedPostRepository } from './repositories/feed-post.repository';
import { FeedPostService } from './services/feed-post.service';

@Module({
  imports: [InfraModule, OutboxModule, PointModule],
  controllers: [FeedController, MediaController],
  providers: [
    FeedPostRepository,
    FeedMediaRepository,
    FeedPostService,
    KudoCreditedListener,
    KudoReservationFailedListener,
  ],
  exports: [FeedPostService],
})
export class FeedModule {}
