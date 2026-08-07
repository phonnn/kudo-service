import { sql, type Kysely } from 'kysely';

// comment — belongs to a feed_post (like feed_media), not its own module:
// the only thing that ever creates or reads a comment is "what's attached
// to this post." No edit/delete in this pass — not asked for, keeps this
// table append-only for now.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('comment')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('post_id', 'uuid', (col) =>
      col.notNull().references('feed_post.id'),
    )
    .addColumn('author_id', 'uuid', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('comment_post_id_created_at_idx')
    .on('comment')
    .columns(['post_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('comment').execute();
}
