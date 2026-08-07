import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface CreateFeedMedia {
  id: string;
  postId: string;
  objectKey: string;
  domain: string;
}

export interface FeedMediaItem {
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

  // Images need no async validate/transcode step, so this writes straight
  // to 'ready'.
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

  // No unique constraint on post_id (convention keeps it to one image
  // today) — takes the first row per post if duplicates ever exist, and
  // only 'ready' media, since pending/rejected shouldn't render.
  async findByPostIds(postIds: string[]): Promise<Map<string, FeedMediaItem>> {
    if (postIds.length === 0) return new Map();

    const rows = await this.database
      .client<FeedMediaDatabaseSchema>()
      .selectFrom('feed_media')
      .select(['post_id', 'object_key', 'domain'])
      .where('post_id', 'in', postIds)
      .where('status', '=', 'ready')
      .execute();

    const byPostId = new Map<string, FeedMediaItem>();
    for (const row of rows) {
      if (!byPostId.has(row.post_id)) {
        byPostId.set(row.post_id, {
          objectKey: row.object_key,
          domain: row.domain,
        });
      }
    }
    return byPostId;
  }
}
