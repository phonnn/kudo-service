import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated, NullableTimestamp } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
export interface FeedPostRecord {
  id: string;
  status: 'pending' | 'published' | 'failed';
  transferId: string;
}

export interface CreateFeedPost {
  id: string;
  authorId: string;
  description: string;
  transferId: string;
  idempotencyKey: string;
}

export interface FeedPostDatabaseSchema {
  feed_post: {
    id: string;
    author_id: string;
    type: string;
    body: string;
    point_transfer_id: string | null;
    visibility: string;
    status: 'pending' | 'published' | 'failed';
    idempotency_key: string;
    created_at: Generated<Date>;
    edited_at: NullableTimestamp;
    deleted_at: NullableTimestamp;
  };
}

@Injectable()
export class FeedPostRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // the primary idempotency guard for sendKudo now — the post is created
  // before point_transfer exists, so this can no longer key off
  // point_transfer_id (§4). point_transfer_id is only nullable for future
  // non-kudo post types (§3); every row this method can find has one, since
  // create() always sets it.
  async findByIdempotencyKey(key: string): Promise<FeedPostRecord | null> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .selectFrom('feed_post')
      .select(['id', 'status', 'point_transfer_id'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      transferId: row.point_transfer_id as string,
    };
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
        idempotency_key: record.idempotencyKey,
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

  // the deferred point-transfer bookkeeping (KudoReservedListener) never
  // completed — only transitions from 'pending', same reasoning as
  // publishByTransferId: a redelivered/retried event is a safe no-op either way.
  async markFailedByTransferId(transferId: string): Promise<void> {
    await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set({ status: 'failed' })
      .where('point_transfer_id', '=', transferId)
      .where('status', '=', 'pending')
      .execute();
  }
}
