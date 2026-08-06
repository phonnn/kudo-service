import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import {
  KUDO_RESERVATION_FAILED,
  type KudoReservationFailedPayload,
} from '../../point/events/kudo.events';
import { FeedPostRepository } from '../repositories/feed-post.repository';

const CONSUMER_GROUP = 'feed-post-reservation-failed-consumer';

// the give-up path §16 anticipated for FeedPostRepository.markFailedByTransferId
// — Phase 1.5's atomic reserve lost a race Phase 1's pre-check didn't catch
// (see PointTransferService.reserveKudoPoints). point never touches
// feed_post directly (§12), hence the event instead of a direct call.
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
