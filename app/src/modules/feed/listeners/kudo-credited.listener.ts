import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import {
  KUDO_CREDITED,
  type KudoCreditedPayload,
} from '../../point/events/kudo.events';
import { FeedPostRepository } from '../repositories/feed-post.repository';

const CONSUMER_GROUP = 'feed-post-publish-consumer';

@Injectable()
export class KudoCreditedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly feedPosts: FeedPostRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(
      KUDO_CREDITED,
      CONSUMER_GROUP,
      (event: DomainEvent) =>
        this.feedPosts.publishByTransferId(
          (event.payload as unknown as KudoCreditedPayload).transferId,
        ),
    );
  }
}
