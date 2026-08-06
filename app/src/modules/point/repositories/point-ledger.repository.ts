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

export interface RedeemDebitRecord {
  userId: string;
  points: number;
  redemptionId: string;
}

export interface BalanceChangesSince {
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

  // one debit row per redemption — the redemption row's own UNIQUE
  // idempotency_key (checked before this is ever called) is what prevents a
  // double-spend, not this insert. Returns the new row's id so the caller
  // can advance receiver_balance's checkpoint to include it.
  async appendRedeemDebit(record: RedeemDebitRecord): Promise<number> {
    const row = await this.database
      .client<PointLedgerDatabaseSchema>()
      .insertInto('point_ledger')
      .values({
        user_id: record.userId,
        delta: -record.points,
        ledger_type: 'redeem_spend',
        ref_type: 'redemption',
        ref_id: record.redemptionId,
        idempotency_key: `redemption:${record.redemptionId}:debit`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return Number(row.id);
  }

  // covers both directions that affect a user's earned balance (B): 'earn'
  // credits and 'redeem_spend' debits. delta is already signed, so a plain
  // sum is correct for either.
  async sumBalanceChangesSince(
    userId: string,
    sinceId: number,
  ): Promise<BalanceChangesSince> {
    const { total, maxId } = await this.database
      .client<PointLedgerDatabaseSchema>()
      .selectFrom('point_ledger')
      .select((eb) => [
        eb.fn.coalesce(eb.fn.sum<number>('delta'), eb.lit(0)).as('total'),
        eb.fn.max('id').as('maxId'),
      ])
      .where('user_id', '=', userId)
      .where('ledger_type', 'in', ['earn', 'redeem_spend'])
      .where('id', '>', sinceId)
      .executeTakeFirstOrThrow();

    return {
      total: Number(total),
      maxId: maxId === null ? null : Number(maxId),
    };
  }
}
