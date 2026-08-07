import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import {
  COMMENT_CREATED,
  type CommentCreatedPayload,
} from '../../feed/events/domain-events';
import { NotificationType } from '../dto/notification-type.enum';
import { NotificationService } from '../services/notification.service';

const CONSUMER_GROUP = 'notification-comment-created-consumer';

@Injectable()
export class CommentCreatedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly notifications: NotificationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(COMMENT_CREATED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<CommentCreatedPayload>),
    );
  }

  private handle(event: DomainEvent<CommentCreatedPayload>): Promise<void> {
    const { postAuthorId, authorId, postId, commentId } = event.payload;
    // don't notify someone about commenting on their own post
    if (postAuthorId === authorId) return Promise.resolve();

    return this.notifications.notify({
      userId: postAuthorId,
      type: NotificationType.COMMENT,
      refId: event.id,
      payload: { postId, commentId, authorId },
    });
  }
}
