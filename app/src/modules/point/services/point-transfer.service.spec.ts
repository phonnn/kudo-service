import type { UnitOfWork } from '@kudo/database';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SenderNotProvisionedError } from '../errors/sender-not-provisioned.error';
import type { OutboxRepository } from '../../outbox';
import type {
  KudoDebitedPayload,
  KudoReservedPayload,
} from '../events/kudo.events';
import type { PointLedgerRepository } from '../repositories/point-ledger.repository';
import type { PointTransferRepository } from '../repositories/point-transfer.repository';
import type { SenderBalanceRepository } from '../repositories/sender-balance.repository';
import { PointTransferService } from './point-transfer.service';

describe('PointTransferService', () => {
  describe('reserveBudget', () => {
    it('passes when the sender has enough remaining balance', async () => {
      const repositories = createRepositories();
      await createService(repositories).reserveBudget('sender', 20);

      expect(repositories.senderBalances.getRemaining).toHaveBeenCalledWith(
        'sender',
      );
    });

    it('rejects insufficient budget when the sender is provisioned but low on budget', async () => {
      const repositories = createRepositories();
      repositories.senderBalances.getRemaining.mockResolvedValue(10);

      await expect(
        createService(repositories).reserveBudget('sender', 20),
      ).rejects.toThrow(InsufficientBudgetError);
    });

    it('throws when the sender has never been provisioned', async () => {
      const repositories = createRepositories();
      repositories.senderBalances.getRemaining.mockResolvedValue(null);

      await expect(
        createService(repositories).reserveBudget('sender', 20),
      ).rejects.toThrow(SenderNotProvisionedError);
    });
  });

  describe('reserveKudoPoints', () => {
    const payload: KudoReservedPayload = {
      transferId: 'transfer-1',
      postId: 'post-1',
      senderId: 'sender',
      recipientId: 'recipient',
      points: 20,
      idempotencyKey: 'request-1',
    };

    it('reserves atomically, creates the transfer, appends the ledger debit, and enqueues kudo.debited', async () => {
      const repositories = createRepositories();
      await createService(repositories).reserveKudoPoints(payload);

      expect(repositories.senderBalances.reserve).toHaveBeenCalledWith(
        'sender',
        20,
      );
      expect(repositories.pointTransfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'transfer-1',
          idempotencyKey: 'request-1',
        }),
      );
      expect(repositories.pointLedger.appendGivingDebit).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'sender', points: 20 }),
      );
      expect(repositories.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'kudo.debited' }),
      );
    });

    it('is a no-op on redelivery once this idempotency key was already fully processed', async () => {
      const repositories = createRepositories();
      repositories.pointTransfers.findByIdempotencyKey.mockResolvedValue({
        id: 'transfer-1',
        status: 'pending',
      });

      await createService(repositories).reserveKudoPoints(payload);

      expect(repositories.senderBalances.reserve).not.toHaveBeenCalled();
      expect(repositories.pointLedger.appendGivingDebit).not.toHaveBeenCalled();
      expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('gives up and enqueues kudo.reservation-failed when the atomic reserve loses the race', async () => {
      const repositories = createRepositories();
      repositories.senderBalances.reserve.mockResolvedValue(false);

      await createService(repositories).reserveKudoPoints(payload);

      expect(repositories.pointTransfers.create).not.toHaveBeenCalled();
      expect(repositories.pointLedger.appendGivingDebit).not.toHaveBeenCalled();
      expect(repositories.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'kudo.reservation-failed',
          payload: { transferId: 'transfer-1' },
        }),
      );
    });
  });

  describe('creditKudo', () => {
    const payload: KudoDebitedPayload = {
      transferId: 'transfer-1',
      postId: 'post-1',
      senderId: 'sender',
      recipientId: 'recipient',
      points: 20,
    };

    it('credits the ledger and enqueues kudo.credited', async () => {
      const repositories = createRepositories();
      await createService(repositories).creditKudo(payload);

      expect(repositories.pointLedger.appendEarnCredit).toHaveBeenCalledWith({
        userId: 'recipient',
        points: 20,
        transferId: 'transfer-1',
      });
      expect(repositories.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kudo:transfer-1:credited',
          topic: 'kudo.credited',
        }),
      );
    });

    it('runs every step inside a single unit of work', async () => {
      const repositories = createRepositories();
      const uow = { run: jest.fn((work: () => Promise<unknown>) => work()) };
      await createService(
        repositories,
        uow as unknown as UnitOfWork,
      ).creditKudo(payload);
      expect(uow.run).toHaveBeenCalledTimes(1);
    });
  });
});

interface MockRepositories {
  senderBalances: jest.Mocked<
    Pick<SenderBalanceRepository, 'getRemaining' | 'reserve'>
  >;
  pointTransfers: jest.Mocked<
    Pick<
      PointTransferRepository,
      'findByIdempotencyKey' | 'create' | 'markCompleted'
    >
  >;
  pointLedger: jest.Mocked<
    Pick<PointLedgerRepository, 'appendGivingDebit' | 'appendEarnCredit'>
  >;
  outbox: jest.Mocked<
    Pick<OutboxRepository, 'enqueue' | 'nextBatch' | 'markPublished'>
  >;
}

function createRepositories(): MockRepositories {
  return {
    senderBalances: {
      getRemaining: jest.fn().mockResolvedValue(100),
      reserve: jest.fn().mockResolvedValue(true),
    },
    pointTransfers: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(true),
      markCompleted: jest.fn(),
    },
    pointLedger: { appendGivingDebit: jest.fn(), appendEarnCredit: jest.fn() },
    outbox: {
      enqueue: jest.fn(),
      nextBatch: jest.fn(),
      markPublished: jest.fn(),
    },
  };
}

function createService(
  repositories: MockRepositories,
  uow: UnitOfWork = {
    run: (work: () => Promise<unknown>) => work(),
  } as unknown as UnitOfWork,
): PointTransferService {
  return new PointTransferService(
    uow,
    repositories.senderBalances as unknown as SenderBalanceRepository,
    repositories.pointTransfers as unknown as PointTransferRepository,
    repositories.pointLedger as unknown as PointLedgerRepository,
    repositories.outbox as unknown as OutboxRepository,
  );
}
