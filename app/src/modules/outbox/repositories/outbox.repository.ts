import { Inject, Injectable } from '@nestjs/common';
import type { OutboxMessage, OutboxSource } from '@kudo/messaging';
import type { Database, Generated, NullableTimestamp } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
export interface EnqueueOutboxMessage {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
}

export interface OutboxDatabaseSchema {
  outbox: {
    id: string;
    topic: string;
    payload: Record<string, unknown>;
    created_at: Generated<Date>;
    published_at: NullableTimestamp;
  };
}

@Injectable()
export class OutboxRepository implements OutboxSource {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async enqueue(message: EnqueueOutboxMessage): Promise<void> {
    await this.database
      .client<OutboxDatabaseSchema>()
      .insertInto('outbox')
      .values({
        id: message.id,
        topic: message.topic,
        payload: message.payload,
        published_at: null,
      })
      .onConflict((conflict) => conflict.column('id').doNothing())
      .execute();
  }

  async nextBatch(limit: number): Promise<OutboxMessage[]> {
    const rows = await this.database
      .client<OutboxDatabaseSchema>()
      .selectFrom('outbox')
      .select(['id', 'topic', 'payload', 'created_at'])
      .where('published_at', 'is', null)
      .orderBy('created_at')
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      type: row.topic,
      payload: row.payload,
      occurredAt: row.created_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.database
      .client<OutboxDatabaseSchema>()
      .updateTable('outbox')
      .set({ published_at: new Date() })
      .where('id', '=', id)
      .where('published_at', 'is', null)
      .execute();
  }
}
