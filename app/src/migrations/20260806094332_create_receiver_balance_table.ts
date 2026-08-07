import type { Kysely } from 'kysely';

// last_ledger_id is a checkpoint so each fold only sums rows newer than the
// last one applied — bounded cost per fold, and naturally idempotent under
// at-least-once redelivery of kudo.credited (a redelivered event sums zero
// new rows, since its ledger row is already <= the checkpoint).
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('receiver_balance')
    .addColumn('user_id', 'uuid', (col) => col.primaryKey())
    .addColumn('earned_points', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_ledger_id', 'bigint', (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('receiver_balance').execute();
}
