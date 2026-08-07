import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

const GIVING_BUDGET = 200;

export interface SenderBalanceDatabaseSchema {
  sender_balance: {
    user_id: string;
    remaining: number;
  };
}

@Injectable()
export class SenderBalanceRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // TODO: not called from anywhere yet — there is no user module. Idempotent:
  // no-op if already provisioned.
  async provision(userId: string): Promise<void> {
    await this.database
      .client<SenderBalanceDatabaseSchema>()
      .insertInto('sender_balance')
      .values({ user_id: userId, remaining: GIVING_BUDGET })
      .onConflict((conflict) => conflict.column('user_id').doNothing())
      .execute();
  }

  async exists(userId: string): Promise<boolean> {
    const row = await this.database
      .client<SenderBalanceDatabaseSchema>()
      .selectFrom('sender_balance')
      .select('user_id')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row !== undefined;
  }

  // Plain, unlocked read — not the authoritative gate. The atomic decrement
  // happens in reserve(). Returns null if the sender has no row yet.
  async getRemaining(userId: string): Promise<number | null> {
    const row = await this.database
      .client<SenderBalanceDatabaseSchema>()
      .selectFrom('sender_balance')
      .select('remaining')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row ? row.remaining : null;
  }

  // Atomic conditional decrement. Locks only the sender's own row —
  // self-contention only. Returns false both when the row doesn't exist and
  // when the balance is too low.
  async reserve(userId: string, points: number): Promise<boolean> {
    const result = await this.database
      .client<SenderBalanceDatabaseSchema>()
      .updateTable('sender_balance')
      .set((eb) => ({ remaining: eb('remaining', '-', points) }))
      .where('user_id', '=', userId)
      .where('remaining', '>=', points)
      .returning('remaining')
      .executeTakeFirst();

    return result !== undefined;
  }

  async refillAll(): Promise<void> {
    await this.database
      .client<SenderBalanceDatabaseSchema>()
      .updateTable('sender_balance')
      .set({ remaining: GIVING_BUDGET })
      .execute();
  }
}
