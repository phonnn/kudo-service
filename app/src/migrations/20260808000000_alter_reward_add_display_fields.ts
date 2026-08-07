import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('reward')
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('image_url', 'text')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('reward')
    .dropColumn('description')
    .dropColumn('image_url')
    .execute();
}
