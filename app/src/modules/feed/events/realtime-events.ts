import type { FeedListItem } from '../repositories/feed-post.repository';
import type { FeedMediaItem } from '../repositories/feed-media.repository';

// One room — every connected client currently viewing the feed is in it;
// there's no per-team/per-user feed room yet.
export const FEED_ROOM = 'feed';

export const POST_PUBLISHED = 'post.published';
export const POST_UPDATED = 'post.updated';

// No myReaction field, unlike FeedItem — this is one broadcast to every
// viewer in the room, not a per-viewer response.
export type PostPublishedEvent = FeedListItem & { media: FeedMediaItem | null };

// An already-visible post's counts changed — carries the fresh count
// directly (not just a signal) so the client can patch that one card in
// place without a refetch.
export interface PostUpdatedEvent {
  postId: string;
  commentCount?: number;
  reactionCount?: number;
}
