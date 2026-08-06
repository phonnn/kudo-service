import { sql, type Kysely } from 'kysely';

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // point_ledger (C) — SOURCE OF TRUTH, append-only
  await db.schema
    .createTable('point_ledger')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('delta', 'integer', (col) => col.notNull())
    .addColumn('ledger_type', 'text', (col) =>
      col
        .notNull()
        .check(
          sql`ledger_type in ('giving_spend','earn','redeem_spend','reversal','adjustment')`,
        ),
    )
    .addColumn('ref_type', 'text', (col) =>
      col.notNull().check(sql`ref_type in ('kudo','redemption')`),
    )
    .addColumn('ref_id', 'uuid', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('point_ledger_user_id_ledger_type_created_at_idx')
    .on('point_ledger')
    .columns(['user_id', 'ledger_type', 'created_at'])
    .execute();

  // sender_balance (A) — giving-budget projection; one row per user per month
  await db.schema
    .createTable('sender_balance')
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('period', 'text', (col) => col.notNull())
    .addColumn('spent', 'integer', (col) => col.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('sender_balance_pk', ['user_id', 'period'])
    .execute();

  // receiver_balance (B) — earned/usable projection
  await db.schema
    .createTable('receiver_balance')
    .addColumn('user_id', 'uuid', (col) => col.primaryKey())
    .addColumn('earned_points', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // point_transfer — one logical send; the money record only
  await db.schema
    .createTable('point_transfer')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('sender_id', 'uuid', (col) => col.notNull())
    .addColumn('recipient_id', 'uuid', (col) => col.notNull())
    .addColumn('points', 'integer', (col) =>
      col.notNull().check(sql`points between 10 and 50`),
    )
    .addColumn('core_value', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('pending','completed','reversed')`),
    )
    .addColumn('reversal_of', 'uuid')
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'point_transfer_sender_recipient_distinct',
      sql`sender_id <> recipient_id`,
    )
    .addForeignKeyConstraint(
      'point_transfer_reversal_of_fk',
      ['reversal_of'],
      'point_transfer',
      ['id'],
    )
    .execute();

  // feed_post — the primary social object; extensible
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

  // feed_media — media belongs to the POST, not the transfer
  await db.schema
    .createTable('feed_media')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('post_id', 'uuid', (col) =>
      col.notNull().references('feed_post.id'),
    )
    .addColumn('kind', 'text', (col) =>
      col.notNull().check(sql`kind in ('image','video')`),
    )
    .addColumn('object_key', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .defaultTo('pending')
        .check(sql`status in ('pending','ready','rejected')`),
    )
    .addColumn('duration_ms', 'integer')
    .execute();

  // reward — the catalog; a plain entity
  await db.schema
    .createTable('reward')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('cost_points', 'integer', (col) => col.notNull())
    .addColumn('stock', 'integer')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // redemption
  await db.schema
    .createTable('redemption')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('reward_id', 'uuid', (col) =>
      col.notNull().references('reward.id'),
    )
    .addColumn('cost_points', 'integer', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('confirmed','failed')`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // outbox — transactional outbox; guarantees event publish
  await db.schema
    .createTable('outbox')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('topic', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('published_at', 'timestamptz')
    .execute();

  // notification — persisted before pushed (P7)
  await db.schema
    .createTable('notification')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('type', 'text', (col) =>
      col
        .notNull()
        .check(sql`type in ('kudo_received','mention','reaction','comment')`),
    )
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('notification_user_id_read_at_created_at_idx')
    .on('notification')
    .columns(['user_id', 'read_at', 'created_at'])
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('notification').execute();
  await db.schema.dropTable('outbox').execute();
  await db.schema.dropTable('redemption').execute();
  await db.schema.dropTable('reward').execute();
  await db.schema.dropTable('feed_media').execute();
  await db.schema.dropTable('feed_post').execute();
  await db.schema.dropTable('point_transfer').execute();
  await db.schema.dropTable('receiver_balance').execute();
  await db.schema.dropTable('sender_balance').execute();
  await db.schema.dropTable('point_ledger').execute();
}
