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

export interface PointLedgerListItem {
  id: number;
  delta: number;
  ledgerType: PointLedgerDatabaseSchema['point_ledger']['ledger_type'];
  refType: PointLedgerDatabaseSchema['point_ledger']['ref_type'];
  refId: string;
  createdAt: Date;
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

  // Idempotent on (transferId, 'earn') — safe under at-least-once redelivery.
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

  // Does not itself guard against double-spend — that's enforced by the
  // redemption row's own unique idempotency key, checked before this is called.
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

  // Covers both directions affecting earned balance: 'earn' credits and
  // 'redeem_spend' debits. delta is already signed, so a plain sum is correct.
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

  // Keyset pagination on id alone — it's a real bigserial, already
  // monotonic with insertion order, so no separate created_at tiebreaker
  // is needed the way UUID-keyed tables need one.
  async listForUser(
    userId: string,
    limit: number,
    cursor: number | null,
  ): Promise<PointLedgerListItem[]> {
    let query = this.database
      .client<PointLedgerDatabaseSchema>()
      .selectFrom('point_ledger')
      .select([
        'id',
        'delta',
        'ledger_type',
        'ref_type',
        'ref_id',
        'created_at',
      ])
      .where('user_id', '=', userId)
      .orderBy('id', 'desc')
      .limit(limit);

    if (cursor !== null) {
      query = query.where('id', '<', cursor);
    }

    const rows = await query.execute();
    return rows.map((row) => ({
      id: Number(row.id),
      delta: row.delta,
      ledgerType: row.ledger_type,
      refType: row.ref_type,
      refId: row.ref_id,
      createdAt: row.created_at,
    }));
  }
}
