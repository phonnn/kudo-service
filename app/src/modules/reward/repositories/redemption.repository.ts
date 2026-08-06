import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface RedemptionRecord {
  id: string;
  status: 'confirmed' | 'failed';
}

export interface CreateRedemption {
  id: string;
  userId: string;
  rewardId: string;
  costPoints: number;
  idempotencyKey: string;
}

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

@Injectable()
export class RedemptionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByIdempotencyKey(key: string): Promise<RedemptionRecord | null> {
    const row = await this.database
      .client<RedemptionDatabaseSchema>()
      .selectFrom('redemption')
      .select(['id', 'status'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ?? null;
  }

  async create(record: CreateRedemption): Promise<void> {
    await this.database
      .client<RedemptionDatabaseSchema>()
      .insertInto('redemption')
      .values({
        id: record.id,
        user_id: record.userId,
        reward_id: record.rewardId,
        cost_points: record.costPoints,
        idempotency_key: record.idempotencyKey,
        status: 'confirmed',
      })
      .execute();
  }
}
