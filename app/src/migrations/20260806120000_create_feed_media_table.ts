import { sql, type Kysely } from 'kysely';

// `kind` is constrained to 'image' only: video support is deliberately out
// of scope for now. `status` keeps all three values anyway since they're a
// property of the data model, not of which kind is currently implemented;
// image rows
// are written straight to 'ready' (no async step needed), so 'pending' and
// 'rejected' simply go unused until video ships. `duration_ms` is likewise
// kept, unused, for the same reason — both are cheap to keep, unlike `kind`,
// which is a real behavior gate worth narrowing now and widening later.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('feed_media')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('post_id', 'uuid', (col) =>
      col.notNull().references('feed_post.id'),
    )
    .addColumn('kind', 'text', (col) =>
      col.notNull().check(sql`kind in ('image')`),
    )
    .addColumn('object_key', 'text', (col) => col.notNull())
    .addColumn('domain', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('pending','ready','rejected')`),
    )
    .addColumn('duration_ms', 'integer')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('feed_media_post_id_idx')
    .on('feed_media')
    .column('post_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('feed_media').execute();
}
