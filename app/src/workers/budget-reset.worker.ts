import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SenderBalanceRepository } from '../modules/point/repositories/sender-balance.repository';

@Injectable()
export class BudgetResetWorker {
  constructor(private readonly senderBalances: SenderBalanceRepository) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async refill(): Promise<void> {
    await this.senderBalances.refillAll();
  }
}
