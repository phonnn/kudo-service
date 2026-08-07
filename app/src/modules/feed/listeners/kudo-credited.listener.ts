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
import { FeedMediaRepository } from '../repositories/feed-media.repository';
import { FeedPostRepository } from '../repositories/feed-post.repository';

const CONSUMER_GROUP = 'feed-post-publish-consumer';

@Injectable()
export class KudoCreditedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(REALTIME_PUSH) private readonly realtime: RealtimePush,
    private readonly feedPosts: FeedPostRepository,
    private readonly feedMedia: FeedMediaRepository,
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
    if (!publishedNow) return;

    const item = await this.feedPosts.findFeedItemById(event.payload.postId);
    if (!item) return; // redelivered after a concurrent delete — nothing to broadcast

    const media = await this.feedMedia.findByPostIds([item.id]);
    const postPublished: PostPublishedEvent = {
      ...item,
      media: media.get(item.id) ?? null,
    };

    this.realtime.publish(FEED_ROOM, {
      type: POST_PUBLISHED,
      data: postPublished,
    });
  }
}
