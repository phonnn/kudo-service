import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
import type { CoreValue } from '../dto/send-kudo.dto';

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

  async findByIdempotencyKey(key: string): Promise<PointTransferRecord | null> {
    const row = await this.database
      .client<PointTransferDatabaseSchema>()
      .selectFrom('point_transfer')
      .select(['id', 'status'])
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ?? null;
  }

  async create(record: CreatePointTransfer): Promise<void> {
    await this.database
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
      .execute();
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
