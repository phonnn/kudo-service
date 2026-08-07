import type { Kysely } from 'kysely';

// name — the display identity for feed cards (author/recipient) instead of
// a raw email address. Collected at registration alongside email/password.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('user')
    .addColumn('name', 'text', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user').dropColumn('name').execute();
}
