export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_BALANCE';

  constructor() {
    super('You do not have enough earned points to redeem this reward.');
  }
}
