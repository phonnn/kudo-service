import { Test } from '@nestjs/testing';
import { SenderBalanceRepository } from '../modules/point/repositories/sender-balance.repository';
import { BudgetResetWorker } from './budget-reset.worker';

describe('BudgetResetWorker', () => {
  it('refills every user on the 1st', async () => {
    const refillAll = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        BudgetResetWorker,
        {
          provide: SenderBalanceRepository,
          useValue: { refillAll },
        },
      ],
    }).compile();

    await module.get(BudgetResetWorker).refill();

    expect(refillAll).toHaveBeenCalledTimes(1);
  });
});
