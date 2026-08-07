import { sql, type Kysely } from 'kysely';

// notification is persisted before pushed: the row is the source of truth,
// the realtime push to `user:{id}` is best-effort acceleration on top of it.
// `ref_id` + the UNIQUE constraint make NotificationRepository.create()
// idempotent under at-least-once redelivery of the domain event that
// triggered it — e.g. a redelivered comment.created for the same comment_id
// no-ops instead of double-notifying.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('notification')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('type', 'text', (col) =>
      col.notNull().check(sql`type in ('kudo_received','comment','reaction')`),
    )
    .addColumn('ref_id', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('notification_user_type_ref_unique', [
      'user_id',
      'type',
      'ref_id',
    ])
    .execute();

  // unread lookup, keyset order
  await db.schema
    .createIndex('notification_user_id_read_at_created_at_idx')
    .on('notification')
    .columns(['user_id', 'read_at', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('notification').execute();
}
