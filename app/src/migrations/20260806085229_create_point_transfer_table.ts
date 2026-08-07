import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('point_transfer')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('sender_id', 'uuid', (col) => col.notNull())
    .addColumn('recipient_id', 'uuid', (col) => col.notNull())
    .addColumn('points', 'integer', (col) =>
      col.notNull().check(sql`points between 10 and 50`),
    )
    .addColumn('core_value', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('pending','completed','reversed')`),
    )
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'point_transfer_sender_recipient_distinct',
      sql`sender_id <> recipient_id`,
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('point_transfer').execute();
}
