import type { SenderBalanceRepository } from '../modules/point/repositories/sender-balance.repository';
import { BudgetResetWorker } from './budget-reset.worker';

describe('BudgetResetWorker', () => {
  it('refills every user on the 1st', async () => {
    const refillAll = jest.fn();
    const worker = new BudgetResetWorker({
      refillAll,
    } as unknown as SenderBalanceRepository);

    await worker.refill();

    expect(refillAll).toHaveBeenCalledTimes(1);
  });
});
