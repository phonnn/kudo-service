import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
export interface GivingDebitRecord {
  userId: string;
  points: number;
  transferId: string;
  idempotencyKey: string;
}

export interface EarnCreditRecord {
  userId: string;
  points: number;
  transferId: string;
}

export interface EarnedSince {
  total: number;
  maxId: number | null;
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

  // idempotent on (transferId,'earn') — safe for at-least-once redelivery of kudo.debited
  async appendEarnCredit(record: EarnCreditRecord): Promise<void> {
    await this.database
      .client<PointLedgerDatabaseSchema>()
      .insertInto('point_ledger')
      .values({
        user_id: record.userId,
        delta: record.points,
        ledger_type: 'earn',
        ref_type: 'kudo',
        ref_id: record.transferId,
        idempotency_key: `kudo:${record.transferId}:credit`,
      })
      .onConflict((conflict) => conflict.column('idempotency_key').doNothing())
      .execute();
  }

  async sumEarnedSince(userId: string, sinceId: number): Promise<EarnedSince> {
    const { total, maxId } = await this.database
      .client<PointLedgerDatabaseSchema>()
      .selectFrom('point_ledger')
      .select((eb) => [
        eb.fn.coalesce(eb.fn.sum<number>('delta'), eb.lit(0)).as('total'),
        eb.fn.max('id').as('maxId'),
      ])
      .where('user_id', '=', userId)
      .where('ledger_type', '=', 'earn')
      .where('id', '>', sinceId)
      .executeTakeFirstOrThrow();

    return {
      total: Number(total),
      maxId: maxId === null ? null : Number(maxId),
    };
  }
}
