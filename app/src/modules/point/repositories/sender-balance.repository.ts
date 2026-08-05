import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@kudo/database';
import { DATABASE } from '../../../infra/token.constant';

export interface SenderBalanceDatabaseSchema {
  sender_balance: {
    user_id: string;
    period: string;
    spent: number;
  };
}

@Injectable()
export class SenderBalanceRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async reserve(
    userId: string,
    period: string,
    points: number,
  ): Promise<boolean> {
    const result = await this.database
      .client<SenderBalanceDatabaseSchema>()
      .insertInto('sender_balance')
      .values({ user_id: userId, period, spent: points })
      .onConflict((conflict) =>
        conflict
          .columns(['user_id', 'period'])
          .doUpdateSet((eb) => ({
            spent: eb('sender_balance.spent', '+', eb.ref('excluded.spent')),
          }))
          .where((eb) =>
            eb(
              eb('sender_balance.spent', '+', eb.ref('excluded.spent')),
              '<=',
              200,
            ),
          ),
      )
      .returning('spent')
      .executeTakeFirst();

    return result !== undefined;
  }
}
