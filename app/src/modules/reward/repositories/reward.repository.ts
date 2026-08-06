import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface RewardRecord {
  id: string;
  costPoints: number;
  stock: number | null;
  active: boolean;
}

export interface RewardDatabaseSchema {
  reward: {
    id: string;
    name: string;
    cost_points: number;
    stock: number | null;
    active: boolean;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class RewardRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string): Promise<RewardRecord | null> {
    const row = await this.database
      .client<RewardDatabaseSchema>()
      .selectFrom('reward')
      .select(['id', 'cost_points', 'stock', 'active'])
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      costPoints: row.cost_points,
      stock: row.stock,
      active: row.active,
    };
  }
}
