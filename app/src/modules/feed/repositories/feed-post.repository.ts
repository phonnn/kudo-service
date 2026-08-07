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

export interface FeedListItem {
  id: string;
  authorId: string;
  body: string;
  points: number | null;
  coreValue: string | null;
  commentCount: number;
  reactionCount: number;
  createdAt: Date;
}

export interface FeedListCursor {
  createdAt: Date;
  id: string;
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
    comment_count: Generated<number>;
    reaction_count: Generated<number>;
  };
  // joined only by listPublished() below — feed_post's own writes never
  // touch point_transfer, this is the one read that needs both.
  point_transfer: {
    id: string;
    points: number;
    core_value: string;
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

  // gate for comment/reaction writes: a post that doesn't exist, isn't
  // published yet, or was soft-deleted isn't something you can interact
  // with — mirrors "feed visible ⟺ money settled" (§4): if it's not
  // visible in the feed, it's not commentable/reactable either.
  async findPublishedById(id: string): Promise<{ id: string } | null> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .selectFrom('feed_post')
      .select(['id'])
      .where('id', '=', id)
      .where('status', '=', 'published')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row ?? null;
  }

  async incrementCommentCount(postId: string): Promise<void> {
    await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set((eb) => ({ comment_count: eb('comment_count', '+', 1) }))
      .where('id', '=', postId)
      .execute();
  }

  async adjustReactionCount(postId: string, delta: 1 | -1): Promise<void> {
    await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set((eb) => ({ reaction_count: eb('reaction_count', '+', delta) }))
      .where('id', '=', postId)
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

  // The read path for GET /kudos (§13's "Read/write split (light CQRS)" —
  // still just a method on this repository, not a separate transactional
  // write): keyset pagination on (created_at, id), never OFFSET (§8 —
  // OFFSET walks discarded rows; keyset seeks via the index at any scroll
  // depth). LEFT JOIN because point_transfer_id is nullable for future
  // non-kudo post types. Reaction data (myReaction) is deliberately not
  // joined here — that's FeedQueryService merging in a separate
  // ReactionRepository query, since "did I react" is a different table's
  // concern from "what posts exist."
  async listPublished(
    limit: number,
    cursor: FeedListCursor | null,
  ): Promise<FeedListItem[]> {
    let query = this.database
      .client<FeedPostDatabaseSchema>()
      .selectFrom('feed_post')
      .leftJoin(
        'point_transfer',
        'point_transfer.id',
        'feed_post.point_transfer_id',
      )
      .where('feed_post.status', '=', 'published')
      .where('feed_post.deleted_at', 'is', null)
      .select([
        'feed_post.id as id',
        'feed_post.author_id as authorId',
        'feed_post.body as body',
        'point_transfer.points as points',
        'point_transfer.core_value as coreValue',
        'feed_post.comment_count as commentCount',
        'feed_post.reaction_count as reactionCount',
        'feed_post.created_at as createdAt',
      ])
      .orderBy('feed_post.created_at', 'desc')
      .orderBy('feed_post.id', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('feed_post.created_at', '<', cursor.createdAt),
          eb.and([
            eb('feed_post.created_at', '=', cursor.createdAt),
            eb('feed_post.id', '<', cursor.id),
          ]),
        ]),
      );
    }

    return query.execute();
  }
}
