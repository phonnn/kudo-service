export interface RedemptionResult {
  id: string;
  status: 'confirmed' | 'failed';
}

export interface RedeemAtomicallyParams {
  userId: string;
  rewardId: string;
  idempotencyKey: string;
}

// The @throws list below is the contract: ANY implementation of
// redeemAtomically() must throw exactly these domain errors for these
// conditions.
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
