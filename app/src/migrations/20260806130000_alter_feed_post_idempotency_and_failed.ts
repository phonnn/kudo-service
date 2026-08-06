import { sql, type Kysely } from 'kysely';

// feed_post is now created before point_transfer exists (§4 — post is the
// primary object, the transfer is attached to it), so its own idempotency
// check can no longer key off point_transfer_id. idempotency_key gives it
// the same guard point_transfer/point_ledger/redemption already have.
// 'failed' is added to status for the (rare, infra-only) case where the
// deferred point-transfer bookkeeping never completes — see
// KudoReservedListener.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('feed_post')
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .execute();

  await sql`ALTER TABLE feed_post DROP CONSTRAINT feed_post_status_check`.execute(
    db,
  );
  await sql`ALTER TABLE feed_post ADD CONSTRAINT feed_post_status_check CHECK (status in ('pending','published','failed'))`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE feed_post DROP CONSTRAINT feed_post_status_check`.execute(
    db,
  );
  await sql`ALTER TABLE feed_post ADD CONSTRAINT feed_post_status_check CHECK (status in ('pending','published'))`.execute(
    db,
  );
  await db.schema
    .alterTable('feed_post')
    .dropColumn('idempotency_key')
    .execute();
}
