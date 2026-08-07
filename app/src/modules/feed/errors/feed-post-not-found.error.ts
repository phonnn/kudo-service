export class FeedPostNotFoundError extends Error {
  readonly code = 'FEED_POST_NOT_FOUND';
  constructor() {
    super('This post does not exist.');
  }
}
