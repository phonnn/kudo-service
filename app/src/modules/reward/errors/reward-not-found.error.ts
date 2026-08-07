export class RewardNotFoundError extends Error {
  readonly code = 'REWARD_NOT_FOUND';

  constructor() {
    super('This reward does not exist.');
  }
}
