import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { OutboxModule } from '../outbox';
import { PointModule } from '../point/point.module';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { KudoReservationFailedListener } from './listeners/kudo-reservation-failed.listener';
import { FeedController } from './controllers/feed.controller';
import { FeedEventsController } from './controllers/feed-events.controller';
import { MediaController } from './controllers/media.controller';
import { CommentController } from './controllers/comment.controller';
import { ReactionController } from './controllers/reaction.controller';
import { CommentRepository } from './repositories/comment.repository';
import { FeedMediaRepository } from './repositories/feed-media.repository';
import { FeedPostRepository } from './repositories/feed-post.repository';
import { ReactionRepository } from './repositories/reaction.repository';
import { CommentService } from './services/comment.service';
import { FeedPostService } from './services/feed-post.service';
import { ReactionService } from './services/reaction.service';

@Module({
  imports: [InfraModule, OutboxModule, PointModule],
  controllers: [
    FeedController,
    FeedEventsController,
    MediaController,
    CommentController,
    ReactionController,
  ],
  providers: [
    FeedPostRepository,
    FeedMediaRepository,
    CommentRepository,
    ReactionRepository,
    FeedPostService,
    CommentService,
    ReactionService,
    KudoCreditedListener,
    KudoReservationFailedListener,
  ],
  exports: [FeedPostService],
})
export class FeedModule {}
