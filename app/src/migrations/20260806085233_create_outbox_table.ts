import { sql, type Kysely } from 'kysely';

// id is text, not uuid: some producers key it deterministically (e.g.
// `kudo:{transferId}:credited`) to dedupe enqueues across at-least-once redelivery
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('outbox')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('topic', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('published_at', 'timestamptz')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('outbox').execute();
}
