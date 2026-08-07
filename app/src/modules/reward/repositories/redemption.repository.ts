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
  reward: {
    id: string;
    name: string;
  };
}

export interface RedemptionListItem {
  id: string;
  rewardId: string;
  rewardName: string;
  costPoints: number;
  status: 'confirmed' | 'failed';
  createdAt: Date;
}

export interface RedemptionListCursor {
  createdAt: Date;
  id: string;
}

// Translates redeem_reward()'s raw Postgres error codes into the domain
// errors RewardRedemptionPort promises to throw. Nothing above this method
// knows these codes exist.
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

  // One round trip: idempotent-replay check, reward validation, balance
  // reserve, stock reserve, and redemption + ledger + outbox writes all
  // happen atomically inside the redeem_reward() Postgres function.
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

  // Keyset pagination on (created_at, id) — never OFFSET, which re-walks
  // discarded rows; keyset seeks via the index at any scroll depth.
  async listForUser(
    userId: string,
    limit: number,
    cursor: RedemptionListCursor | null,
  ): Promise<RedemptionListItem[]> {
    let query = this.database
      .client<RedemptionDatabaseSchema>()
      .selectFrom('redemption')
      .innerJoin('reward', 'reward.id', 'redemption.reward_id')
      .select([
        'redemption.id as id',
        'redemption.reward_id as rewardId',
        'reward.name as rewardName',
        'redemption.cost_points as costPoints',
        'redemption.status as status',
        'redemption.created_at as createdAt',
      ])
      .where('redemption.user_id', '=', userId)
      .orderBy('redemption.created_at', 'desc')
      .orderBy('redemption.id', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('redemption.created_at', '<', cursor.createdAt),
          eb.and([
            eb('redemption.created_at', '=', cursor.createdAt),
            eb('redemption.id', '<', cursor.id),
          ]),
        ]),
      );
    }

    return query.execute();
  }
}
