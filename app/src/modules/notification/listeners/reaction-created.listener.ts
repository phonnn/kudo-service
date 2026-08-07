import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import {
  REACTION_CREATED,
  type ReactionCreatedPayload,
} from '../../feed/events/domain-events';
import { NotificationType } from '../dto/notification-type.enum';
import { NotificationService } from '../services/notification.service';

const CONSUMER_GROUP = 'notification-reaction-created-consumer';

@Injectable()
export class ReactionCreatedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly notifications: NotificationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(REACTION_CREATED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<ReactionCreatedPayload>),
    );
  }

  private handle(event: DomainEvent<ReactionCreatedPayload>): Promise<void> {
    const { postAuthorId, userId, postId, type } = event.payload;
    if (postAuthorId === userId) return Promise.resolve();

    return this.notifications.notify({
      userId: postAuthorId,
      type: NotificationType.REACTION,
      refId: event.id,
      payload: { postId, userId, type },
    });
  }
}
