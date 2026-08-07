export class InvalidPointsError extends Error {
  readonly code = 'INVALID_POINTS';

  constructor(value: number) {
    super(`Points must be an integer between 10 and 50; received ${value}.`);
  }
}
