export class RewardOutOfStockError extends Error {
  readonly code = 'REWARD_OUT_OF_STOCK';

  constructor() {
    super('This reward is out of stock.');
  }
}
