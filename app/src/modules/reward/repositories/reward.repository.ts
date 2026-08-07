import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface RewardRecord {
  id: string;
  costPoints: number;
  stock: number | null;
  active: boolean;
}

export interface RewardListItem {
  id: string;
  name: string;
  description: string;
  costPoints: number;
  stock: number | null;
  imageUrl: string | null;
}

export interface RewardDatabaseSchema {
  reward: {
    id: string;
    name: string;
    description: string;
    cost_points: number;
    stock: number | null;
    image_url: string | null;
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

  // the browsable catalog — inactive rewards are never listed (they can
  // still be looked up by id via findById, e.g. for a redemption made
  // before deactivation), and finite-stock rewards at 0 remain listed
  // rather than disappearing, so a client can show "out of stock"
  // instead of the item just vanishing.
  async listActive(): Promise<RewardListItem[]> {
    const rows = await this.database
      .client<RewardDatabaseSchema>()
      .selectFrom('reward')
      .select([
        'id',
        'name',
        'description',
        'cost_points',
        'stock',
        'image_url',
      ])
      .where('active', '=', true)
      .orderBy('name')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      costPoints: row.cost_points,
      stock: row.stock,
      imageUrl: row.image_url,
    }));
  }
}
