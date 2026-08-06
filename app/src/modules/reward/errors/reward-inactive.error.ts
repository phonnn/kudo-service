export class RewardInactiveError extends Error {
  readonly code = 'REWARD_INACTIVE';

  constructor() {
    super('This reward is no longer available.');
  }
}
