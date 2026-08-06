import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { OutboxModule } from '../outbox';
import { PointModule } from '../point/point.module';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { KudoReservationFailedListener } from './listeners/kudo-reservation-failed.listener';
import { KudoController } from './kudo.controller';
import { MediaController } from './media.controller';
import { FeedMediaRepository } from './repositories/feed-media.repository';
import { FeedPostRepository } from './repositories/feed-post.repository';
import { FeedPostService } from './services/feed-post.service';
import { SendKudoService } from './services/send-kudo.service';

@Module({
  imports: [InfraModule, OutboxModule, PointModule],
  controllers: [KudoController, MediaController],
  providers: [
    FeedPostRepository,
    FeedMediaRepository,
    FeedPostService,
    SendKudoService,
    KudoCreditedListener,
    KudoReservationFailedListener,
  ],
  exports: [FeedPostService],
})
export class FeedModule {}
