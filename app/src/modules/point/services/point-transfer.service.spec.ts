import { CoreValue } from '../dto/send-kudo.dto';
import type { UnitOfWork } from '@kudo/database';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SelfRecognitionError } from '../errors/self-recognition.error';
import { SenderNotProvisionedError } from '../errors/sender-not-provisioned.error';
import type { FeedPostRepository } from '../../feed';
import type { OutboxRepository } from '../../outbox';
import type { KudoDebitedPayload } from '../events/kudo.events';
import type { PointLedgerRepository } from '../repositories/point-ledger.repository';
import type { PointTransferRepository } from '../repositories/point-transfer.repository';
import type { SenderBalanceRepository } from '../repositories/sender-balance.repository';
import { PointTransferService } from './point-transfer.service';

/* eslint-disable @typescript-eslint/unbound-method */

describe('PointTransferService', () => {
  describe('sendKudo', () => {
    const command = {
      senderId: 'sender',
      recipientId: 'recipient',
      points: 20,
      coreValue: CoreValue.TEAMWORK,
      description: 'Great job',
      idempotencyKey: 'request-1',
    };

    it('writes every table through its repository', async () => {
      const repositories = createRepositories();
      const result = await createService(repositories).sendKudo(command);
      expect(repositories.senderBalances.reserve).toHaveBeenCalledWith(
        'sender',
        20,
      );
      expect(repositories.pointTransfers.create).toHaveBeenCalled();
      expect(repositories.pointLedger.appendGivingDebit).toHaveBeenCalled();
      expect(repositories.feedPosts.create).toHaveBeenCalled();
      expect(repositories.outbox.enqueue).toHaveBeenCalled();
      expect(result.status).toBe('pending');
    });

    it('returns the existing transfer and post for an idempotent retry', async () => {
      const repositories = createRepositories();
      repositories.pointTransfers.findByIdempotencyKey.mockResolvedValue({
        id: 'transfer',
        status: 'pending',
      });
      repositories.feedPosts.findByTransferId.mockResolvedValue({
        id: 'post',
        status: 'pending',
      });
      await expect(
        createService(repositories).sendKudo(command),
      ).resolves.toEqual({
        transferId: 'transfer',
        postId: 'post',
        status: 'pending',
      });
      expect(repositories.senderBalances.reserve).not.toHaveBeenCalled();
    });

    it('rejects insufficient budget when the sender is provisioned but low on budget', async () => {
      const repositories = createRepositories();
      repositories.senderBalances.reserve.mockResolvedValue(false);
      repositories.senderBalances.exists.mockResolvedValue(true);
      await expect(
        createService(repositories).sendKudo(command),
      ).rejects.toThrow(InsufficientBudgetError);
      expect(repositories.pointTransfers.create).not.toHaveBeenCalled();
    });

    it('throws when the sender has never been provisioned', async () => {
      const repositories = createRepositories();
      repositories.senderBalances.reserve.mockResolvedValue(false);
      repositories.senderBalances.exists.mockResolvedValue(false);
      await expect(
        createService(repositories).sendKudo(command),
      ).rejects.toThrow(SenderNotProvisionedError);
      expect(repositories.pointTransfers.create).not.toHaveBeenCalled();
    });

    it('rejects self recognition before opening a transaction', () => {
      const repositories = createRepositories();
      const uow = { run: jest.fn() } as unknown as UnitOfWork;
      expect(() =>
        createService(repositories, uow).sendKudo({
          ...command,
          recipientId: 'sender',
        }),
      ).toThrow(SelfRecognitionError);
      expect(uow.run).not.toHaveBeenCalled();
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
    Pick<SenderBalanceRepository, 'reserve' | 'exists'>
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
  feedPosts: jest.Mocked<
    Pick<
      FeedPostRepository,
      'findByTransferId' | 'create' | 'publishByTransferId'
    >
  >;
  outbox: jest.Mocked<
    Pick<OutboxRepository, 'enqueue' | 'nextBatch' | 'markPublished'>
  >;
}

function createRepositories(): MockRepositories {
  return {
    senderBalances: {
      reserve: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(true),
    },
    pointTransfers: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      markCompleted: jest.fn(),
    },
    pointLedger: { appendGivingDebit: jest.fn(), appendEarnCredit: jest.fn() },
    feedPosts: {
      findByTransferId: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      publishByTransferId: jest.fn(),
    },
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
    repositories.feedPosts as unknown as FeedPostRepository,
    repositories.outbox as unknown as OutboxRepository,
  );
}
