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

  findByIdempotencyKey(key: string): Promise<FeedPostRecord | null> {
    return this.feedPosts.findByIdempotencyKey(key);
  }

  // Must be called from inside a unitOfWork.run() block.
  async createPendingPost(command: CreatePendingPostCommand): Promise<void> {
    await this.feedPosts.create({
      id: command.postId,
      authorId: command.authorId,
      description: command.description,
      tag: command.tag,
      transferId: command.transferId,
      idempotencyKey: command.idempotencyKey,
    });

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

      await this.pointTransfers.reserveBudget(command.senderId, command.points);

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
