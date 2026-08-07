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
}
