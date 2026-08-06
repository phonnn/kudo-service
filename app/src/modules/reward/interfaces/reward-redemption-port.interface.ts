export interface RedemptionResult {
  id: string;
  status: 'confirmed' | 'failed';
}

export interface RedeemAtomicallyParams {
  userId: string;
  rewardId: string;
  idempotencyKey: string;
}

// The seam RedeemRewardService depends on instead of RedemptionRepository
// directly. RedemptionRepository's stored-procedure call (redeem_reward(),
// see its migration) is today's only implementation of redeemAtomically()
// A future alternative (e.g. the plain multi-statement-transaction version
// this replaced) would implement the same contract and swap in via
// reward.module.ts's provider binding, with no change to the service.
//
// The @throws list below is the contract: ANY implementation of
// redeemAtomically() must throw exactly these domain errors for these
// conditions. How an implementation arrives at the right one is its own
// business — RedemptionRepository's raw Postgres error codes (KU001-KU005)
// are that translation mechanism for ITS implementation only, and stay
// local to redemption.repository.ts; a non-Postgres implementation would
// have no codes to translate and would just throw these directly.
export interface RewardRedemptionPort {
  findByIdempotencyKey: (key: string) => Promise<RedemptionResult | null>;

  /**
   * @throws {RewardNotFoundError} rewardId does not exist
   * @throws {RewardInactiveError} the reward exists but active is false
   * @throws {InsufficientBalanceError} earned balance is below the reward's cost
   * @throws {RewardOutOfStockError} a finite-stock reward has none left
   * @throws {RecipientNotProvisionedError} the user has no receiver_balance row yet
   */
  redeemAtomically: (
    params: RedeemAtomicallyParams,
  ) => Promise<RedemptionResult>;
}

export const REWARD_REDEMPTION_PORT = Symbol('REWARD_REDEMPTION_PORT');
