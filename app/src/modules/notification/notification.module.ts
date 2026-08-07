import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { NotificationController } from './controllers/notification.controller';
import { NotificationEventsController } from './controllers/notification-events.controller';
import { CommentCreatedListener } from './listeners/comment-created.listener';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { ReactionCreatedListener } from './listeners/reaction-created.listener';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [InfraModule],
  controllers: [NotificationController, NotificationEventsController],
  providers: [
    NotificationRepository,
    NotificationService,
    KudoCreditedListener,
    CommentCreatedListener,
    ReactionCreatedListener,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
