import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Database, Generated } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface CreateUserRecord {
  email: string;
  passwordHash: string;
}

export interface UserDatabaseSchema {
  user: {
    id: string;
    email: string;
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
      .select(['id', 'email', 'password_hash'])
      .where('email', '=', email)
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.database
      .client<UserDatabaseSchema>()
      .selectFrom('user')
      .select(['id', 'email', 'password_hash'])
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  // onConflict().doNothing() is the authoritative dedup — the email
  // UNIQUE constraint decides, not the caller's prior findByEmail read,
  // which is only a fast-path check (same reasoning as RedeemRewardService's
  // pre-check vs. redeem_reward()'s atomic insert). Returns null when the
  // conflict fired instead of inserting, so the caller can tell the two
  // apart.
  async create(record: CreateUserRecord): Promise<UserRecord | null> {
    const row = await this.database
      .client<UserDatabaseSchema>()
      .insertInto('user')
      .values({
        id: randomUUID(),
        email: record.email,
        password_hash: record.passwordHash,
      })
      .onConflict((conflict) => conflict.column('email').doNothing())
      .returning(['id', 'email', 'password_hash'])
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }
}

function toRecord(
  row: Pick<UserDatabaseSchema['user'], 'id' | 'email' | 'password_hash'>,
): UserRecord {
  return { id: row.id, email: row.email, passwordHash: row.password_hash };
}
