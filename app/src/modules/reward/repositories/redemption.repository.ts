import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { sql } from 'kysely';
import { DATABASE } from '../../../infra/token.constant';
import { RecipientNotProvisionedError } from '../../point/errors/recipient-not-provisioned.error';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { RewardInactiveError } from '../errors/reward-inactive.error';
import { RewardNotFoundError } from '../errors/reward-not-found.error';
import { RewardOutOfStockError } from '../errors/reward-out-of-stock.error';
import type {
  RedeemAtomicallyParams,
  RedemptionResult,
  RewardRedemptionPort,
} from '../interfaces/reward-redemption-port.interface';

export interface RedemptionDatabaseSchema {
  redemption: {
    id: string;
    user_id: string;
    reward_id: string;
    cost_points: number;
    idempotency_key: string;
    status: 'confirmed' | 'failed';
    created_at: Generated<Date>;
  };
}

// Translates redeem_reward()'s raw Postgres error codes (see its migration)
// into the domain errors RewardRedemptionPort.redeemAtomically() promises to
// throw (see that interface's @throws list — that's the contract; this map
// is just how THIS Postgres-backed implementation honors it). Vendor code
// dies here per §10's rule — nothing above this method knows the function,
// or these codes, exist.
const ERROR_CODE_TO_DOMAIN_ERROR: Record<string, () => Error> = {
  KU001: () => new RewardNotFoundError(),
  KU002: () => new RewardInactiveError(),
  KU003: () => new InsufficientBalanceError(),
  KU004: () => new RewardOutOfStockError(),
  KU005: () => new RecipientNotProvisionedError(),
};

@Injectable()
export class RedemptionRepository implements RewardRedemptionPort {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByIdempotencyKey(key: string): Promise<RedemptionResult | null> {
    const row = await this.database
      .client<RedemptionDatabaseSchema>()
      .selectFrom('redemption')
      .select(['id', 'status'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ?? null;
  }

  // one round trip: idempotent-replay check, reward validation, balance
  // reserve, stock reserve, redemption + ledger + outbox writes, all inside
  // the redeem_reward() Postgres function (see its migration for the body
  // and the reasoning for putting it there).
  async redeemAtomically(
    params: RedeemAtomicallyParams,
  ): Promise<RedemptionResult> {
    try {
      const result = await sql<{
        redemption_id: string;
        status: 'confirmed' | 'failed';
      }>`select * from redeem_reward(${params.userId}, ${params.rewardId}, ${params.idempotencyKey})`.execute(
        this.database.client(),
      );

      const row = result.rows[0];
      return { id: row.redemption_id, status: row.status };
    } catch (error) {
      const code = (error as { code?: string }).code;
      const toDomainError = code && ERROR_CODE_TO_DOMAIN_ERROR[code];
      if (toDomainError) {
        throw toDomainError();
      }
      throw error;
    }
  }
}
