import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
import type { CoreValue } from '../dto/core-value.enum';

export interface PointTransferRecord {
  id: string;
  status: 'pending' | 'completed' | 'reversed';
}

export interface CreatePointTransfer {
  id: string;
  senderId: string;
  recipientId: string;
  points: number;
  coreValue: CoreValue;
  idempotencyKey: string;
}

export interface PointTransferDatabaseSchema {
  point_transfer: {
    id: string;
    sender_id: string;
    recipient_id: string;
    points: number;
    core_value: string;
    status: 'pending' | 'completed' | 'reversed';
    idempotency_key: string;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class PointTransferRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // point_transfer keeps its own explicit idempotency lookup, independent of
  // feed_post's (which guards the sync Phase 1 request-retry case) — this
  // one is point_transfer's own guard for anything that needs to ask "does
  // this idempotency key already have a transfer" directly.
  async findByIdempotencyKey(key: string): Promise<PointTransferRecord | null> {
    const row = await this.database
      .client<PointTransferDatabaseSchema>()
      .selectFrom('point_transfer')
      .select(['id', 'status'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ?? null;
  }

  // called from KudoReservedListener, which must tolerate at-least-once
  // redelivery of kudo.reserved (P6) — ON CONFLICT DO NOTHING makes the
  // insert itself the idempotency guard rather than a separate check-then-act
  // (same idiom as PointLedgerRepository.appendEarnCredit). Returns whether
  // this call actually inserted the row, so the listener knows whether to
  // proceed with the ledger append + kudo.debited enqueue or skip them
  // because a prior delivery already did.
  async create(record: CreatePointTransfer): Promise<boolean> {
    const result = await this.database
      .client<PointTransferDatabaseSchema>()
      .insertInto('point_transfer')
      .values({
        id: record.id,
        sender_id: record.senderId,
        recipient_id: record.recipientId,
        points: record.points,
        core_value: record.coreValue,
        status: 'pending',
        idempotency_key: record.idempotencyKey,
      })
      .onConflict((conflict) => conflict.column('idempotency_key').doNothing())
      .returning('id')
      .executeTakeFirst();

    return result !== undefined;
  }

  // only transitions from 'pending' — a redelivered kudo.debited is a safe no-op
  async markCompleted(id: string): Promise<void> {
    await this.database
      .client<PointTransferDatabaseSchema>()
      .updateTable('point_transfer')
      .set({ status: 'completed' })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .execute();
  }
}
