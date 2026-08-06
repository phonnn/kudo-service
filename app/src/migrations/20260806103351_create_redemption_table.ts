import { sql, type Kysely } from 'kysely';

// redemption — see redemption.repository.ts. idempotency_key is the
// rapid-double-click guard; cost_points is a snapshot (the catalog may reprice later)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('redemption')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('reward_id', 'uuid', (col) =>
      col.notNull().references('reward.id'),
    )
    .addColumn('cost_points', 'integer', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('confirmed','failed')`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('redemption').execute();
}
