import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('point_ledger')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('delta', 'integer', (col) => col.notNull())
    .addColumn('ledger_type', 'text', (col) =>
      col
        .notNull()
        .check(
          sql`ledger_type in ('giving_spend','earn','redeem_spend','reversal','adjustment')`,
        ),
    )
    .addColumn('ref_type', 'text', (col) =>
      col.notNull().check(sql`ref_type in ('kudo','redemption')`),
    )
    .addColumn('ref_id', 'uuid', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('point_ledger_user_id_ledger_type_created_at_idx')
    .on('point_ledger')
    .columns(['user_id', 'ledger_type', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('point_ledger').execute();
}
