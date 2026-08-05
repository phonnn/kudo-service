import { CoreValue } from '../dto/send-kudo.dto';
import type { UnitOfWork } from '@kudo/database';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SelfRecognitionError } from '../errors/self-recognition.error';
import type { FeedPostRepository } from '../../feed';
import type { OutboxRepository } from '../../outbox';
import type { PointLedgerRepository } from '../repositories/point-ledger.repository';
import type { PointTransferRepository } from '../repositories/point-transfer.repository';
import type { SenderBalanceRepository } from '../repositories/sender-balance.repository';
import { PointTransferService } from './point-transfer.service';

/* eslint-disable @typescript-eslint/unbound-method */

describe('PointTransferService', () => {
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
      expect.stringMatching(/^\d{4}-\d{2}$/),
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

  it('rejects insufficient budget before table appends', async () => {
    const repositories = createRepositories();
    repositories.senderBalances.reserve.mockResolvedValue(false);
    await expect(createService(repositories).sendKudo(command)).rejects.toThrow(
      InsufficientBudgetError,
    );
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

interface MockRepositories {
  senderBalances: jest.Mocked<Pick<SenderBalanceRepository, 'reserve'>>;
  pointTransfers: jest.Mocked<
    Pick<PointTransferRepository, 'findByIdempotencyKey' | 'create'>
  >;
  pointLedger: jest.Mocked<Pick<PointLedgerRepository, 'appendGivingDebit'>>;
  feedPosts: jest.Mocked<
    Pick<FeedPostRepository, 'findByTransferId' | 'create'>
  >;
  outbox: jest.Mocked<
    Pick<OutboxRepository, 'enqueue' | 'nextBatch' | 'markPublished'>
  >;
}

function createRepositories(): MockRepositories {
  return {
    senderBalances: { reserve: jest.fn().mockResolvedValue(true) },
    pointTransfers: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    pointLedger: { appendGivingDebit: jest.fn() },
    feedPosts: {
      findByTransferId: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
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
