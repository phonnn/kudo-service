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

  // `xmax = 0` in RETURNING is Postgres's way to tell an insert from an
  // ON CONFLICT update in the same query — distinguishes a fresh reaction
  // from a type change.
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
