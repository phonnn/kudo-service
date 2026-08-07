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
  tag: string;
  transferId: string;
  idempotencyKey: string;
}

export interface FeedListItem {
  id: string;
  type: string;
  body: string;
  authorId: string;
  authorName: string;
  commentCount: number;
  reactionCount: number;
  createdAt: Date;
  kudo: {
    recipientId: string;
    recipientName: string;
    points: number;
    tag: string | null;
  } | null;
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
    status: 'pending' | 'published' | 'failed';
    idempotency_key: string;
    tag: string | null;
    created_at: Generated<Date>;
    edited_at: NullableTimestamp;
    deleted_at: NullableTimestamp;
    comment_count: Generated<number>;
    reaction_count: Generated<number>;
  };
  // joined only by listPublished() below — feed_post's own writes never
  // touch point_transfer/user, this is the one read that needs all three.
  point_transfer: {
    id: string;
    recipient_id: string;
    points: number;
  };
  user: {
    id: string;
    name: string;
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
        status: 'pending',
        idempotency_key: record.idempotencyKey,
        tag: record.tag,
        edited_at: null,
        deleted_at: null,
      })
      .execute();
  }

  // gate for comment/reaction writes: a post that doesn't exist, isn't
  // published yet, or was soft-deleted isn't something you can interact
  // with — mirrors "feed visible ⟺ money settled" (§4): if it's not
  // visible in the feed, it's not commentable/reactable either. Returns
  // authorId too — CommentService/ReactionService need it to know who to
  // notify (and to skip notifying someone about their own post).
  async findPublishedById(
    id: string,
  ): Promise<{ id: string; authorId: string } | null> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .selectFrom('feed_post')
      .select(['id', 'author_id as authorId'])
      .where('id', '=', id)
      .where('status', '=', 'published')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row ?? null;
  }

  // Returns the post-increment count (not void) so callers can push it
  // straight into a realtime "post.updated" event without a second read.
  async incrementCommentCount(postId: string): Promise<number> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set((eb) => ({ comment_count: eb('comment_count', '+', 1) }))
      .where('id', '=', postId)
      .returning('comment_count')
      .executeTakeFirstOrThrow();

    return row.comment_count;
  }

  async adjustReactionCount(postId: string, delta: 1 | -1): Promise<number> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set((eb) => ({ reaction_count: eb('reaction_count', '+', delta) }))
      .where('id', '=', postId)
      .returning('reaction_count')
      .executeTakeFirstOrThrow();

    return row.reaction_count;
  }

  // only transitions from 'pending' — a redelivered kudo.debited is a safe
  // no-op. Returns whether this call actually flipped the row, so the
  // listener can tell a genuine transition from a no-op redelivery and
  // avoid re-announcing a post that's already been announced once.
  async publishByTransferId(transferId: string): Promise<boolean> {
    const row = await this.database
      .client<FeedPostDatabaseSchema>()
      .updateTable('feed_post')
      .set({ status: 'published' })
      .where('point_transfer_id', '=', transferId)
      .where('status', '=', 'pending')
      .returning('id')
      .executeTakeFirst();

    return row !== undefined;
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

  // The read path for GET /kudos — full card data, not bare ids: author and
  // (for kudo posts) recipient are resolved to their display name here
  // rather than left for the client to look up separately. Keyset pagination on
  // (created_at, id), never OFFSET (§8 — OFFSET walks discarded rows;
  // keyset seeks via the index at any scroll depth). `author` is an INNER
  // JOIN (every post has a real author); `point_transfer`/`recipient` are
  // LEFT JOINs since only kudo-type posts have either. Reaction data
  // (myReaction) and media are deliberately not joined here — those are
  // FeedQueryService merging in separate ReactionRepository/
  // FeedMediaRepository queries, since "did I react" / "what media" are
  // different tables' concerns from "what posts exist," and (for media)
  // joining risks duplicating a post row if it ever had more than one.
  async listPublished(
    limit: number,
    cursor: FeedListCursor | null,
  ): Promise<FeedListItem[]> {
    let query = this.database
      .client<FeedPostDatabaseSchema>()
      .selectFrom('feed_post')
      .innerJoin('user as author', 'author.id', 'feed_post.author_id')
      .leftJoin(
        'point_transfer',
        'point_transfer.id',
        'feed_post.point_transfer_id',
      )
      .leftJoin(
        'user as recipient',
        'recipient.id',
        'point_transfer.recipient_id',
      )
      .where('feed_post.status', '=', 'published')
      .where('feed_post.deleted_at', 'is', null)
      .select([
        'feed_post.id as id',
        'feed_post.type as type',
        'feed_post.body as body',
        'feed_post.author_id as authorId',
        'author.name as authorName',
        'feed_post.comment_count as commentCount',
        'feed_post.reaction_count as reactionCount',
        'feed_post.created_at as createdAt',
        'point_transfer.recipient_id as recipientId',
        'recipient.name as recipientName',
        'point_transfer.points as points',
        'feed_post.tag as tag',
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

    const rows = await query.execute();

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      body: row.body,
      authorId: row.authorId,
      authorName: row.authorName,
      commentCount: row.commentCount,
      reactionCount: row.reactionCount,
      createdAt: row.createdAt,
      kudo:
        row.recipientId && row.recipientName && row.points !== null
          ? {
              recipientId: row.recipientId,
              recipientName: row.recipientName,
              points: row.points,
              tag: row.tag,
            }
          : null,
    }));
  }
}
