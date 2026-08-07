import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import type { RealtimePush } from '@kudo/realtime';
import { EVENT_BUS, REALTIME_PUSH } from '../../../infra/token.constant';
import {
  KUDO_CREDITED,
  type KudoCreditedPayload,
} from '../../point/events/kudo.events';
import {
  FEED_ROOM,
  POST_PUBLISHED,
  type PostPublishedEvent,
} from '../events/realtime-events';
import { FeedPostRepository } from '../repositories/feed-post.repository';

const CONSUMER_GROUP = 'feed-post-publish-consumer';

@Injectable()
export class KudoCreditedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(REALTIME_PUSH) private readonly realtime: RealtimePush,
    private readonly feedPosts: FeedPostRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(KUDO_CREDITED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<KudoCreditedPayload>),
    );
  }

  private async handle(event: DomainEvent<KudoCreditedPayload>): Promise<void> {
    const publishedNow = await this.feedPosts.publishByTransferId(
      event.payload.transferId,
    );

    if (publishedNow) {
      const postPublished: PostPublishedEvent = {
        postId: event.payload.postId,
      };
      this.realtime.publish(FEED_ROOM, {
        type: POST_PUBLISHED,
        data: postPublished,
      });
    }
  }
}
