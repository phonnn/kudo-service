import { sql, type Kysely } from 'kysely';

// Three related cleanups to feed_post/point_transfer, done together since
// none of the intermediate states were ever applied anywhere:
//   1. `tag` — what a kudo celebrates (teamwork/ownership/innovation/
//      customer_focus). Presentational (P2: "money and presentation are
//      separate entities"), so it belongs on feed_post, not point_transfer.
//      Nullable, same reasoning as point_transfer_id: only kudo-type posts
//      have one. A CHECK on an IN-list already passes on NULL.
//   2. point_transfer.core_value dropped — superseded by (1).
//   3. feed_post.visibility dropped — scaffolding for audience-scoping
//      that was never built: always 'global', never read anywhere.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('feed_post').addColumn('tag', 'text').execute();

  await sql`ALTER TABLE feed_post ADD CONSTRAINT feed_post_tag_check CHECK (tag in ('teamwork','ownership','innovation','customer_focus'))`.execute(
    db,
  );

  await db.schema
    .alterTable('point_transfer')
    .dropColumn('core_value')
    .execute();

  await db.schema.alterTable('feed_post').dropColumn('visibility').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('feed_post')
    .addColumn('visibility', 'text', (col) => col.notNull().defaultTo('global'))
    .execute();

  await db.schema
    .alterTable('point_transfer')
    .addColumn('core_value', 'text', (col) =>
      col.notNull().defaultTo('teamwork'),
    )
    .execute();

  await sql`ALTER TABLE feed_post DROP CONSTRAINT feed_post_tag_check`.execute(
    db,
  );
  await db.schema.alterTable('feed_post').dropColumn('tag').execute();
}
