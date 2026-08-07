import type { Kysely } from 'kysely';

// point_transfer_id is written before that row exists (async Phase 1.5),
// and on a lost reservation race the row never exists at all — a FK can't
// hold in either case.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('feed_post')
    .dropConstraint('feed_post_point_transfer_id_fkey')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('feed_post')
    .addForeignKeyConstraint(
      'feed_post_point_transfer_id_fkey',
      ['point_transfer_id'],
      'point_transfer',
      ['id'],
    )
    .execute();
}
