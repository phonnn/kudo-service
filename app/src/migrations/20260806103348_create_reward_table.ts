import { sql, type Kysely } from 'kysely';

// reward — the catalog; a plain entity (see reward.repository.ts)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('reward')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('cost_points', 'integer', (col) => col.notNull())
    .addColumn('stock', 'integer')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('reward').execute();
}
