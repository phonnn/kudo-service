import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

export interface CreateUserRecord {
  email: string;
  name: string;
  passwordHash: string;
}

export interface UserDatabaseSchema {
  user: {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    created_at: Generated<Date>;
  };
}

export interface UserListItem {
  id: string;
  name: string;
  createdAt: Date;
}

export interface UserListCursor {
  createdAt: Date;
  id: string;
}

export interface ListUsersParams {
  search: string | null;
  excludeUserId: string;
  limit: number;
  cursor: UserListCursor | null;
}

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.database
      .client<UserDatabaseSchema>()
      .selectFrom('user')
      .select(['id', 'email', 'name', 'password_hash'])
      .where('email', '=', email)
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.database
      .client<UserDatabaseSchema>()
      .selectFrom('user')
      .select(['id', 'email', 'name', 'password_hash'])
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  // Keyset pagination on (created_at, id) — never OFFSET, which re-walks
  // discarded rows; keyset seeks via the index at any scroll depth.
  async list(params: ListUsersParams): Promise<UserListItem[]> {
    let query = this.database
      .client<UserDatabaseSchema>()
      .selectFrom('user')
      .select(['id', 'name', 'created_at'])
      .where('id', '!=', params.excludeUserId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(params.limit);

    if (params.search) {
      const pattern = `%${params.search}%`;
      query = query.where((eb) =>
        eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]),
      );
    }

    if (params.cursor) {
      const cursor = params.cursor;
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', cursor.createdAt),
          eb.and([
            eb('created_at', '=', cursor.createdAt),
            eb('id', '<', cursor.id),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    }));
  }

  // The email UNIQUE constraint is the authoritative dedup, not the caller's
  // prior findByEmail read. Returns null when the conflict fired instead of
  // inserting, so the caller can tell the two apart.
  async create(record: CreateUserRecord): Promise<UserRecord | null> {
    const row = await this.database
      .client<UserDatabaseSchema>()
      .insertInto('user')
      .values({
        id: randomUUID(),
        email: record.email,
        name: record.name,
        password_hash: record.passwordHash,
      })
      .onConflict((conflict) => conflict.column('email').doNothing())
      .returning(['id', 'email', 'name', 'password_hash'])
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }
}

function toRecord(
  row: Pick<
    UserDatabaseSchema['user'],
    'id' | 'email' | 'name' | 'password_hash'
  >,
): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
  };
}
