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

  // TODO: not called from anywhere yet — there is no user module. Once one
  // exists, it should call this on user creation. Kept here (not in
  // sendKudo) because provisioning a user's budget is a user-lifecycle
  // concern, not a send-a-kudo concern. Idempotent: no-op if already provisioned.
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

  // a plain, unlocked read — NOT the authoritative gate. Used only for
  // Phase 1's fail-fast pre-check (§4); the real atomic decrement happens
  // later via reserve(), in the same transaction as the ledger debit, so
  // "balance moves with the ledger" stays true even after the split.
  // Returns null if the sender has no row yet.
  async getRemaining(userId: string): Promise<number | null> {
    const row = await this.database
      .client<SenderBalanceDatabaseSchema>()
      .selectFrom('sender_balance')
      .select('remaining')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row ? row.remaining : null;
  }

  // atomic conditional decrement (§4/§7's "UPDATE A(sender) WHERE spent +
  // :points <= 200", expressed as a remaining-balance countdown instead).
  // Locks only the sender's own row — self-contention only. Returns false
  // both when the row doesn't exist and when the balance is too low.
  // Called from reserveKudoPoints() (Phase 1.5, §4), not the Phase 1
  // pre-check — a false here means getRemaining()'s earlier read went stale
  // (a race, not a request-time error the sender ever sees synchronously),
  // and the caller reacts by giving up on this specific kudo (KUDO_RESERVATION_FAILED),
  // not by disambiguating via exists() the way sendKudo() used to.
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

  // giving budget resets on the 1st (§1) — refill every existing user back
  // to the full monthly budget.
  async refillAll(): Promise<void> {
    await this.database
      .client<SenderBalanceDatabaseSchema>()
      .updateTable('sender_balance')
      .set({ remaining: GIVING_BUDGET })
      .execute();
  }
}
