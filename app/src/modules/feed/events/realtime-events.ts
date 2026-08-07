// One room — every connected client currently viewing the feed is in it;
// there's no per-team/per-user feed room yet.
export const FEED_ROOM = 'feed';

export const POST_PUBLISHED = 'post.published';
export const POST_UPDATED = 'post.updated';

// Signal only, no post data — the client refetches via GET /kudos rather
// than duplicating the list endpoint's shape here.
export interface PostPublishedEvent {
  postId: string;
}

// An already-visible post's counts changed — carries the fresh count
// directly (not just a signal) so the client can patch that one card in
// place without a refetch.
export interface PostUpdatedEvent {
  postId: string;
  commentCount?: number;
  reactionCount?: number;
}
