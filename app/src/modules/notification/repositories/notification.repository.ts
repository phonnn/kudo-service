import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated, NullableTimestamp } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';
import type { NotificationType } from '../dto/notification-type.enum';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  senderName: string | null;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotification {
  id: string;
  userId: string;
  type: NotificationType;
  // The emitting domain event's own id — redelivery of that same event
  // must produce the same ref_id (so the UNIQUE constraint dedupes it);
  // a genuinely new event (e.g. unreact-then-react again) always mints a
  // fresh event id, so it's never mistaken for a duplicate.
  refId: string;
  payload: Record<string, unknown>;
}

export interface NotificationListCursor {
  createdAt: Date;
  id: string;
}

export interface NotificationDatabaseSchema {
  notification: {
    id: string;
    user_id: string;
    type: NotificationType;
    ref_id: string;
    payload: Record<string, unknown>;
    read_at: NullableTimestamp;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class NotificationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // ON CONFLICT is the authoritative dedup — (user_id, type, ref_id)
  // UNIQUE — not a prior read; returns null when the conflict fires.
  async create(record: CreateNotification): Promise<NotificationRecord | null> {
    const row = await this.database
      .client<NotificationDatabaseSchema>()
      .insertInto('notification')
      .values({
        id: record.id,
        user_id: record.userId,
        type: record.type,
        ref_id: record.refId,
        payload: record.payload,
        read_at: null,
      })
      .onConflict((conflict) =>
        conflict.columns(['user_id', 'type', 'ref_id']).doNothing(),
      )
      .returning(['id', 'type', 'payload', 'read_at', 'created_at'])
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  async listForUser(
    userId: string,
    limit: number,
    cursor: NotificationListCursor | null,
  ): Promise<NotificationRecord[]> {
    let query = this.database
      .client<NotificationDatabaseSchema>()
      .selectFrom('notification')
      .select(['id', 'type', 'payload', 'read_at', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', cursor.createdAt),
          eb.and([
            eb('created_at', '=', cursor.createdAt),
            eb('id', '<', cursor.id),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    return rows.map(toRecord);
  }

  // Ownership-scoped — only marks the row read if it belongs to userId.
  // Deliberately NOT gated on `read_at IS NULL`: re-marking an
  // already-read notification still returns true, rather than a
  // confusing 404 on a harmless retry.
  async markRead(id: string, userId: string): Promise<boolean> {
    const row = await this.database
      .client<NotificationDatabaseSchema>()
      .updateTable('notification')
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();

    return row !== undefined;
  }
}

// Deliberately not `Pick<NotificationDatabaseSchema['notification'], ...>`
// — that would carry the raw ColumnType<Select, Insert, Update> wrapper
// (NullableTimestamp/Generated) instead of the resolved Select shape
// Kysely's actual query results have (Date | null / Date). This is that
// resolved shape, named locally.
function toRecord(row: {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}): NotificationRecord {
  return {
    id: row.id,
    type: row.type,
    senderName:
      typeof row.payload.senderName === 'string'
        ? row.payload.senderName
        : null,
    payload: row.payload,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
