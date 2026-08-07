import type { Kysely } from 'kysely';

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
