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
