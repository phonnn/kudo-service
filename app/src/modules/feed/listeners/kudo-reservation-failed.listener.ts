import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import {
  KUDO_RESERVATION_FAILED,
  type KudoReservationFailedPayload,
} from '../../point/events/kudo.events';
import { FeedPostRepository } from '../repositories/feed-post.repository';

const CONSUMER_GROUP = 'feed-post-reservation-failed-consumer';

// `point` never touches feed_post directly, hence this reacts to an event
// instead of a direct call.
@Injectable()
export class KudoReservationFailedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly feedPosts: FeedPostRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(KUDO_RESERVATION_FAILED, CONSUMER_GROUP, (event) =>
      this.handle(
        event as unknown as DomainEvent<KudoReservationFailedPayload>,
      ),
    );
  }

  private handle(
    event: DomainEvent<KudoReservationFailedPayload>,
  ): Promise<void> {
    return this.feedPosts.markFailedByTransferId(event.payload.transferId);
  }
}
