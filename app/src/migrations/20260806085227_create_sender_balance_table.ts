import type { Kysely } from 'kysely';

// sender_balance (A) — giving-budget projection; one row per user, refilled
// to the full monthly budget on the 1st (see sender-balance.repository.ts)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('sender_balance')
    .addColumn('user_id', 'uuid', (col) => col.primaryKey())
    .addColumn('remaining', 'integer', (col) => col.notNull().defaultTo(200))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('sender_balance').execute();
}
