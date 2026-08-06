import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated, NullableTimestamp } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
export interface FeedPostRecord {
  id: string;
  status: 'pending' | 'published';
}

export interface CreateFeedPost {
  id: string;
  authorId: string;
  description: string;
  transferId: string;
}

export interface FeedPostDatabaseSchema {
  feed_post: {
    id: string;
    author_id: string;
    type: string;
    body: string;
    point_transfer_id: string | null;
    visibility: string;
    status: 'pending' | 'published';
    created_at: Generated<Date>;
    edited_at: NullableTimestamp;
    deleted_at: NullableTimestamp;
  };
}

@Injectable()
export class FeedPostRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByTransferId(transferId: string): Promise<FeedPostRecord | null> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .selectFrom('feed_post')
      .select(['id', 'status'])
      .where('point_transfer_id', '=', transferId)
      .executeTakeFirst();
    return row ?? null;
  }

  async create(record: CreateFeedPost): Promise<void> {
    await this.database
      .client<FeedPostDatabaseSchema>()
      .insertInto('feed_post')
      .values({
        id: record.id,
        author_id: record.authorId,
        type: 'kudo',
        body: record.description,
        point_transfer_id: record.transferId,
        visibility: 'global',
        status: 'pending',
        edited_at: null,
        deleted_at: null,
      })
      .execute();
  }

  // only transitions from 'pending' — a redelivered kudo.debited is a safe no-op
  async publishByTransferId(transferId: string): Promise<void> {
    await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set({ status: 'published' })
      .where('point_transfer_id', '=', transferId)
      .where('status', '=', 'pending')
      .execute();
  }
}
