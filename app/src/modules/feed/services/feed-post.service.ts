import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { randomUUID } from 'node:crypto';
import type { Tag } from '../dto/tag.enum';
import type { ReactionType } from '../dto/reaction-type.enum';
import {
  KUDO_RESERVED,
  type KudoReservedPayload,
} from '../../point/events/kudo.events';
import { SelfRecognitionError } from '../../point/errors/self-recognition.error';
import { validatePoints } from '../../point/helpers/points.helper';
import { PointTransferService } from '../../point/services/point-transfer.service';
import { OutboxRepository } from '../../outbox';
import type { CreatedKudo } from '../interfaces/created-kudo.interface';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import {
  FeedMediaRepository,
  type FeedMediaItem,
} from '../repositories/feed-media.repository';
import {
  FeedPostRepository,
  type FeedListCursor,
  type FeedListItem,
  type FeedPostRecord,
} from '../repositories/feed-post.repository';
import { ReactionRepository } from '../repositories/reaction.repository';

export interface CreatePendingPostMedia {
  objectKey: string;
  domain: string;
}

export interface CreatePendingPostCommand {
  postId: string;
  authorId: string;
  description: string;
  tag: Tag;
  transferId: string;
  idempotencyKey: string;
  media?: CreatePendingPostMedia;
}

export interface SendKudoCommand {
  senderId: string;
  recipientId: string;
  points: number;
  tag: Tag;
  description: string;
  idempotencyKey: string;
  media?: CreatePendingPostMedia;
}

export interface FeedItem extends FeedListItem {
  myReaction: ReactionType | null;
  media: FeedMediaItem | null;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Everything about feed_post — one entity, one service, same reasoning as
// FeedPostRepository absorbing the read path: writes (send-kudo, §4 Phase
// 1) and reads (listFeed, §13's "Read/write split (light CQRS)") both
// belong to whoever owns feed_post, they just don't share a transaction —
// listFeed never opens a UnitOfWork, since none of its three queries
// (posts, reactions, media) mutate. `point` is only asked to do the one
// synchronous thing whose failure the caller must see (P4): reserve the
// budget. Everything else about actually recording the transfer is
// deferred to PointTransferService.reserveKudoPoints(), reacting to
// kudo.reserved — `point` doesn't create feed_post, and this service
// doesn't create point_transfer.
@Injectable()
export class FeedPostService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly feedPosts: FeedPostRepository,
    private readonly feedMedia: FeedMediaRepository,
    private readonly reactions: ReactionRepository,
    private readonly pointTransfers: PointTransferService,
    private readonly outbox: OutboxRepository,
  ) {}

  // the primary idempotency guard for sendKudo (§4) — the post is the
  // first thing created, before point_transfer exists.
  findByIdempotencyKey(key: string): Promise<FeedPostRecord | null> {
    return this.feedPosts.findByIdempotencyKey(key);
  }

  // Must be called from inside a unitOfWork.run() block — see
  // ARCHITECTURE.md §4 Phase 1: the post (and its media, if any) has to
  // commit atomically with the budget reserve, so this relies on the
  // ambient transaction the caller already opened rather than opening its
  // own (same pattern as ReceiverBalanceService.syncFromLedger).
  async createPendingPost(command: CreatePendingPostCommand): Promise<void> {
    await this.feedPosts.create({
      id: command.postId,
      authorId: command.authorId,
      description: command.description,
      tag: command.tag,
      transferId: command.transferId,
      idempotencyKey: command.idempotencyKey,
    });

    // images need no async validate/transcode step (§16), so this writes
    // straight to 'ready' inside the same transaction as the post above.
    if (command.media) {
      await this.feedMedia.create({
        id: randomUUID(),
        postId: command.postId,
        objectKey: command.media.objectKey,
        domain: command.media.domain,
      });
    }
  }

  sendKudo(command: SendKudoCommand): Promise<CreatedKudo> {
    if (command.senderId === command.recipientId) {
      throw new SelfRecognitionError();
    }

    validatePoints(command.points);
    return this.unitOfWork.run(async () => {
      const existingPost = await this.findByIdempotencyKey(
        command.idempotencyKey,
      );

      if (existingPost) {
        return {
          transferId: existingPost.transferId,
          postId: existingPost.id,
          status: existingPost.status,
        };
      }

      // the one synchronous, fail-fast call into `point` (§4 Phase 1) —
      // participates in this same transaction, see reserveBudget()'s comment.
      await this.pointTransfers.reserveBudget(command.senderId, command.points);

      // minted now, before point_transfer exists — KudoReservedListener
      // uses this same id when it eventually creates that row.
      const transferId = randomUUID();
      const postId = randomUUID();

      await this.createPendingPost({
        postId,
        authorId: command.senderId,
        description: command.description,
        tag: command.tag,
        transferId,
        idempotencyKey: command.idempotencyKey,
        media: command.media,
      });

      const kudoReserved: KudoReservedPayload = {
        transferId,
        postId,
        senderId: command.senderId,
        recipientId: command.recipientId,
        points: command.points,
        idempotencyKey: command.idempotencyKey,
      };

      await this.outbox.enqueue({
        id: transferId,
        topic: KUDO_RESERVED,
        payload: kudoReserved as unknown as Record<string, unknown>,
      });

      return { transferId, postId, status: 'pending' };
    });
  }

  // The read path for GET /kudos. Orchestrates three independent queries —
  // FeedPostRepository (posts), ReactionRepository (this viewer's
  // reactions on that page), FeedMediaRepository (media on that page) —
  // and merges them here rather than any repository knowing about
  // another's table. None of the three mutate, so this never opens a
  // UnitOfWork, and the reads don't need to be atomic with each other — a
  // reaction/comment/media that lands between them just shows up on the
  // next page load.
  async listFeed(
    viewerId: string,
    limitInput: number | undefined,
    cursorInput: string | undefined,
  ): Promise<FeedPage> {
    const limit = Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = cursorInput ? decodeCursor(cursorInput) : null;

    const posts = await this.feedPosts.listPublished(limit, cursor);
    const postIds = posts.map((post) => post.id);
    const [myReactions, media] = await Promise.all([
      this.reactions.findTypesByPostIdsAndUser(postIds, viewerId),
      this.feedMedia.findByPostIds(postIds),
    ]);

    const items = posts.map((post) => ({
      ...post,
      myReaction: myReactions.get(post.id) ?? null,
      media: media.get(post.id) ?? null,
    }));

    const last = items[items.length - 1];
    const nextCursor =
      items.length === limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { items, nextCursor };
  }
}

function encodeCursor(cursor: FeedListCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

function decodeCursor(value: string): FeedListCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { createdAt: string; id: string };

    const createdAt = new Date(decoded.createdAt);
    if (!decoded.id || Number.isNaN(createdAt.getTime())) {
      throw new Error('malformed cursor payload');
    }

    return { createdAt, id: decoded.id };
  } catch {
    throw new InvalidCursorError();
  }
}
