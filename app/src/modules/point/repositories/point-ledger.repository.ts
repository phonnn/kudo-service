import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
export interface GivingDebitRecord {
  userId: string;
  points: number;
  transferId: string;
  idempotencyKey: string;
}

export interface PointLedgerDatabaseSchema {
  point_ledger: {
    id: Generated<number>;
    user_id: string;
    delta: number;
    ledger_type:
      'giving_spend' | 'earn' | 'redeem_spend' | 'reversal' | 'adjustment';
    ref_type: 'kudo' | 'redemption';
    ref_id: string;
    idempotency_key: string;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class PointLedgerRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async appendGivingDebit(record: GivingDebitRecord): Promise<void> {
    await this.database
      .client<PointLedgerDatabaseSchema>()
      .insertInto('point_ledger')
      .values({
        user_id: record.userId,
        delta: -record.points,
        ledger_type: 'giving_spend',
        ref_type: 'kudo',
        ref_id: record.transferId,
        idempotency_key: `kudo:${record.idempotencyKey}:debit`,
      })
      .execute();
  }
}
