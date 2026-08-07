import { sql, type Kysely } from 'kysely';

// reaction — one row per (post, user): UNIQUE via composite PK enforces
// "at most one reaction per user per post" at the DB level, not just in
// application code. Reacting again with a new type is an UPSERT that
// replaces the row (see ReactionRepository.upsert); un-reacting deletes it.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('reaction')
    .addColumn('post_id', 'uuid', (col) =>
      col.notNull().references('feed_post.id'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('type', 'text', (col) =>
      col.notNull().check(sql`type in ('like','celebrate','clap','love')`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('reaction_pk', ['post_id', 'user_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('reaction').execute();
}
