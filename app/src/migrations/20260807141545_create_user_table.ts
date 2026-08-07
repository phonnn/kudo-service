import { sql, type Kysely } from 'kysely';

// user — this app's own identity record, independent of whichever
// AuthProvider (@kudo/security) verified the credential. Every other table
// already references user_id (point_ledger, feed_post, redemption, ...),
// so this row has to exist regardless of who issued the token. Only
// password_hash is local-provider-specific; a future non-local provider
// would still JIT-provision a row here, just without a password.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user').execute();
}
