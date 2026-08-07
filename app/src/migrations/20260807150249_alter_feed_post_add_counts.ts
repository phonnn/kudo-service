import type { Kysely } from 'kysely';

// Maintained projections, not COUNT(*) at read time — the feed list reads
// these directly instead of joining comment/reaction per post on every page
// load. Updated in the same transaction as the comment/reaction write since
// both tables live in this same module, no cross-module event needed.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('feed_post')
    .addColumn('comment_count', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .alterTable('feed_post')
    .addColumn('reaction_count', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('feed_post')
    .dropColumn('reaction_count')
    .execute();
  await db.schema.alterTable('feed_post').dropColumn('comment_count').execute();
}
