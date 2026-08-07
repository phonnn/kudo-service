import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import {
  KUDO_CREDITED,
  type KudoCreditedPayload,
} from '../../point/events/kudo.events';
import { NotificationType } from '../dto/notification-type.enum';
import { NotificationService } from '../services/notification.service';

const CONSUMER_GROUP = 'notification-kudo-credited-consumer';

// Same topic feed's and point's own KudoCreditedListener classes react to
// (§16: "each module can have its own same-named listener for a topic it
// cares about, since the class lives in, and is scoped to, that module")
// — this one's job is only to notify the recipient, nothing else.
@Injectable()
export class KudoCreditedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly notifications: NotificationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(KUDO_CREDITED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<KudoCreditedPayload>),
    );
  }

  private handle(event: DomainEvent<KudoCreditedPayload>): Promise<void> {
    return this.notifications.notify({
      userId: event.payload.recipientId,
      type: NotificationType.KUDO_RECEIVED,
      refId: event.payload.transferId,
      payload: {
        transferId: event.payload.transferId,
        postId: event.payload.postId,
        points: event.payload.points,
      },
    });
  }
}
