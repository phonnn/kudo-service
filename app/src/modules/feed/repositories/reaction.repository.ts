import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { sql } from 'kysely';
import { DATABASE } from '../../../infra/token.constant';
import type { ReactionType } from '../dto/reaction-type.enum';

export interface ReactionDatabaseSchema {
  reaction: {
    post_id: string;
    user_id: string;
    type: string;
    created_at: Generated<Date>;
  };
}

@Injectable()
export class ReactionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // UPSERT on the (post_id, user_id) PK: a fresh reaction inserts, a
  // changed type replaces the row in place. `xmax = 0` is Postgres's
  // standard way to tell "this row was just inserted" from "this row was
  // updated by ON CONFLICT" in the same RETURNING — the caller needs that
  // distinction to know whether reaction_count actually changed (a type
  // change is still exactly one reaction, not a new one).
  async upsert(
    postId: string,
    userId: string,
    type: ReactionType,
  ): Promise<{ wasNew: boolean }> {
    const row = await this.database
      .client<ReactionDatabaseSchema>()
      .insertInto('reaction')
      .values({ post_id: postId, user_id: userId, type })
      .onConflict((conflict) =>
        conflict.columns(['post_id', 'user_id']).doUpdateSet({ type }),
      )
      .returning(() => sql<boolean>`(xmax = 0)`.as('was_new'))
      .executeTakeFirstOrThrow();

    return { wasNew: row.was_new };
  }

  // idempotent: deleting a reaction that isn't there is a no-op, not an
  // error (P6) — `wasRemoved` tells the service whether to decrement the
  // count, since a redundant delete shouldn't touch it.
  async remove(
    postId: string,
    userId: string,
  ): Promise<{ wasRemoved: boolean }> {
    const row = await this.database
      .client<ReactionDatabaseSchema>()
      .deleteFrom('reaction')
      .where('post_id', '=', postId)
      .where('user_id', '=', userId)
      .returning('post_id')
      .executeTakeFirst();

    return { wasRemoved: row !== undefined };
  }

  async findByPostAndUser(
    postId: string,
    userId: string,
  ): Promise<ReactionType | null> {
    const row = await this.database
      .client<ReactionDatabaseSchema>()
      .selectFrom('reaction')
      .select('type')
      .where('post_id', '=', postId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return (row?.type as ReactionType) ?? null;
  }

  // Batched, not one correlated subquery per feed row — the caller
  // (FeedQueryService) fetches a page of posts first, then asks here once
  // for "which of these did this viewer react to." Keeps feed-post
  // reading and reaction reading as two independently testable queries
  // instead of one join.
  async findTypesByPostIdsAndUser(
    postIds: string[],
    userId: string,
  ): Promise<Map<string, ReactionType>> {
    if (postIds.length === 0) return new Map();

    const rows = await this.database
      .client<ReactionDatabaseSchema>()
      .selectFrom('reaction')
      .select(['post_id', 'type'])
      .where('post_id', 'in', postIds)
      .where('user_id', '=', userId)
      .execute();

    return new Map(rows.map((row) => [row.post_id, row.type as ReactionType]));
  }
}
