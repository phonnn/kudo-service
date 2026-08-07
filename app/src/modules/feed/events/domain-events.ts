// Durable, cross-module domain events (outbox-guaranteed, at-least-once —
// P6), distinct from realtime-events.ts's ephemeral UI-broadcast signals.
// `notification` subscribes to these; it never taps into the feed room's
// realtime push, which is a different concern (browsers currently viewing
// the feed vs. "durably notify the one person who cares").
export const COMMENT_CREATED = 'comment.created';
export const REACTION_CREATED = 'reaction.created';

export interface CommentCreatedPayload {
  postId: string;
  postAuthorId: string;
  commentId: string;
  authorId: string;
}

export interface ReactionCreatedPayload {
  postId: string;
  postAuthorId: string;
  userId: string;
  type: string;
}
