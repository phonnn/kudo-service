import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface ReceiverBalanceDatabaseSchema {
  receiver_balance: {
    user_id: string;
    earned_points: number;
    last_ledger_id: number;
  };
}

export interface ReceiverBalanceCheckpoint {
  lastLedgerId: number;
}

@Injectable()
export class ReceiverBalanceRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // TODO: not called from anywhere yet — there is no user module. Once one
  // exists, it should call this on user creation, same as
  // SenderBalanceRepository.provision(). Idempotent: no-op if already provisioned.
  async provision(userId: string): Promise<void> {
    await this.database
      .client<ReceiverBalanceDatabaseSchema>()
      .insertInto('receiver_balance')
      .values({ user_id: userId, earned_points: 0, last_ledger_id: 0 })
      .onConflict((conflict) => conflict.column('user_id').doNothing())
      .execute();
  }

  // locks the row for the caller's transaction — must be called from inside
  // a unitOfWork.run() block, otherwise the lock is released immediately.
  // Returns null if the recipient has no row yet; never provisions one.
  async lockForUpdate(
    userId: string,
  ): Promise<ReceiverBalanceCheckpoint | null> {
    const row = await this.database
      .client<ReceiverBalanceDatabaseSchema>()
      .selectFrom('receiver_balance')
      .select('last_ledger_id')
      .where('user_id', '=', userId)
      .forUpdate()
      .executeTakeFirst();

    return row ? { lastLedgerId: Number(row.last_ledger_id) } : null;
  }

  async applyDelta(
    userId: string,
    points: number,
    lastLedgerId: number,
  ): Promise<void> {
    await this.database
      .client<ReceiverBalanceDatabaseSchema>()
      .updateTable('receiver_balance')
      .set((eb) => ({
        earned_points: eb('earned_points', '+', points),
        last_ledger_id: lastLedgerId,
      }))
      .where('user_id', '=', userId)
      .execute();
  }
}
