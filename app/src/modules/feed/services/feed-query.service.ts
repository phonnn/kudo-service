import { Injectable } from '@nestjs/common';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import type { ReactionType } from '../dto/reaction-type.enum';
import {
  FeedPostRepository,
  type FeedListCursor,
  type FeedListItem,
} from '../repositories/feed-post.repository';
import { ReactionRepository } from '../repositories/reaction.repository';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface FeedItem extends FeedListItem {
  myReaction: ReactionType | null;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

// Orchestrates two independent read queries — FeedQueryRepository (posts)
// and ReactionRepository (this viewer's reactions on that page) — and
// merges them here, rather than either repository knowing about the
// other's table. Deliberately outside the UnitOfWork (§13's "Read/write
// split (light CQRS)"): neither query mutates, so there's no transaction
// boundary to own, and the two reads don't need to be atomic with each
// other — a reaction that lands between them just shows up on the next
// page load.
@Injectable()
export class FeedQueryService {
  constructor(
    private readonly feedPosts: FeedPostRepository,
    private readonly reactions: ReactionRepository,
  ) {}

  async listFeed(
    viewerId: string,
    limitInput: number | undefined,
    cursorInput: string | undefined,
  ): Promise<FeedPage> {
    const limit = Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = cursorInput ? decodeCursor(cursorInput) : null;

    const posts = await this.feedPosts.listPublished(limit, cursor);
    const myReactions = await this.reactions.findTypesByPostIdsAndUser(
      posts.map((post) => post.id),
      viewerId,
    );

    const items = posts.map((post) => ({
      ...post,
      myReaction: myReactions.get(post.id) ?? null,
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
