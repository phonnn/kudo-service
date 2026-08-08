import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface CommentRecord {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface CommentWithAuthor extends CommentRecord {
  authorName: string;
}

export interface CreateComment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
}

export interface CommentDatabaseSchema {
  comment: {
    id: string;
    post_id: string;
    author_id: string;
    body: string;
    created_at: Generated<Date>;
  };
  user: {
    id: string;
    name: string;
  };
}

@Injectable()
export class CommentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(record: CreateComment): Promise<CommentRecord> {
    const row = await this.database
      .client<CommentDatabaseSchema>()
      .insertInto('comment')
      .values({
        id: record.id,
        post_id: record.postId,
        author_id: record.authorId,
        body: record.body,
      })
      .returning(['id', 'post_id', 'author_id', 'body', 'created_at'])
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  // Returns the most recent `limit` comments, oldest first — matching the
  // order comments appear in as they're created.
  async listByPostId(
    postId: string,
    limit: number,
  ): Promise<CommentWithAuthor[]> {
    const rows = await this.database
      .client<CommentDatabaseSchema>()
      .selectFrom('comment')
      .innerJoin('user', 'user.id', 'comment.author_id')
      .where('comment.post_id', '=', postId)
      .orderBy('comment.created_at', 'desc')
      .orderBy('comment.id', 'desc')
      .limit(limit)
      .select([
        'comment.id as id',
        'comment.post_id as post_id',
        'comment.author_id as author_id',
        'comment.body as body',
        'comment.created_at as created_at',
        'user.name as authorName',
      ])
      .execute();

    return rows.reverse().map((row) => ({
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
      authorName: row.authorName,
    }));
  }
}
