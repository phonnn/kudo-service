// §9's live-feed vocabulary: "new top-of-feed kudo → lightweight signal,
// client pulls" vs "comment/reaction on a visible card → live-patch in
// place." Two event types, one room — every connected client currently
// viewing the feed is in it (there's no per-team/per-user feed room yet).
export const FEED_ROOM = 'feed';

export const POST_PUBLISHED = 'post.published';
export const POST_UPDATED = 'post.updated';

// A post just became visible in the feed (§4/§5) — a signal only, no
// post data attached. The client refetches (GET /kudos) rather than
// trusting a payload that would just duplicate FeedPostRepository
// .listPublished()'s shape a second time.
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
