export class InvalidCursorError extends Error {
  readonly code = 'INVALID_CURSOR';
  constructor() {
    super('The pagination cursor is malformed.');
  }
}
