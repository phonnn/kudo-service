import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface PointTransferRecord {
  id: string;
  status: 'pending' | 'completed' | 'reversed';
}

export interface CreatePointTransfer {
  id: string;
  senderId: string;
  recipientId: string;
  points: number;
  idempotencyKey: string;
}

export interface PointTransferDatabaseSchema {
  point_transfer: {
    id: string;
    sender_id: string;
    recipient_id: string;
    points: number;
    status: 'pending' | 'completed' | 'reversed';
    idempotency_key: string;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class PointTransferRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByIdempotencyKey(key: string): Promise<PointTransferRecord | null> {
    const row = await this.database
      .client<PointTransferDatabaseSchema>()
      .selectFrom('point_transfer')
      .select(['id', 'status'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ?? null;
  }

  // ON CONFLICT DO NOTHING makes the insert itself the idempotency guard.
  // Returns whether this call actually inserted the row, so the caller can
  // tell a fresh reserve from an already-processed redelivery.
  async create(record: CreatePointTransfer): Promise<boolean> {
    const result = await this.database
      .client<PointTransferDatabaseSchema>()
      .insertInto('point_transfer')
      .values({
        id: record.id,
        sender_id: record.senderId,
        recipient_id: record.recipientId,
        points: record.points,
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
