export class SelfRecognitionError extends Error {
  readonly code = 'SELF_RECOGNITION';

  constructor() {
    super('You cannot send a kudo to yourself.');
  }
}
