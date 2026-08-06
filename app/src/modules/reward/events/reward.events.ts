export const REWARD_REDEEMED = 'reward.redeemed';

export interface RewardRedeemedPayload {
  redemptionId: string;
  userId: string;
  rewardId: string;
  costPoints: number;
}
