import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface CreateFeedMedia {
  id: string;
  postId: string;
  objectKey: string;
  domain: string;
}

export interface FeedMediaDatabaseSchema {
  feed_media: {
    id: string;
    post_id: string;
    kind: 'image';
    object_key: string;
    domain: string;
    status: 'pending' | 'ready' | 'rejected';
    duration_ms: number | null;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class FeedMediaRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // images need no async validation/transcode step (§16), so this writes
  // straight to 'ready' — there is no pending→ready transition to wait on.
  async create(record: CreateFeedMedia): Promise<void> {
    await this.database
      .client<FeedMediaDatabaseSchema>()
      .insertInto('feed_media')
      .values({
        id: record.id,
        post_id: record.postId,
        kind: 'image',
        object_key: record.objectKey,
        domain: record.domain,
        status: 'ready',
        duration_ms: null,
      })
      .execute();
  }
}
