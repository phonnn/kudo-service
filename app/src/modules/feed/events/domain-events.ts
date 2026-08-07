// Durable, at-least-once domain events (outbox-guaranteed) — distinct from
// realtime-events.ts's ephemeral broadcasts.
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
