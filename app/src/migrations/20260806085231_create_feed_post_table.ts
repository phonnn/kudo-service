import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('feed_post')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('author_id', 'uuid', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('point_transfer_id', 'uuid', (col) =>
      col.references('point_transfer.id'),
    )
    .addColumn('visibility', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('pending','published')`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('edited_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('feed_post').execute();
}
