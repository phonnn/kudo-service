import { Test } from '@nestjs/testing';
import { UnitOfWork } from '@kudo/database';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SenderNotProvisionedError } from '../errors/sender-not-provisioned.error';
import { OutboxRepository } from '../../outbox';
import type {
  KudoDebitedPayload,
  KudoReservedPayload,
} from '../events/kudo.events';
import { PointLedgerRepository } from '../repositories/point-ledger.repository';
import { PointTransferRepository } from '../repositories/point-transfer.repository';
import { SenderBalanceRepository } from '../repositories/sender-balance.repository';
import { PointTransferService } from './point-transfer.service';

describe('PointTransferService', () => {
  describe('reserveBudget', () => {
    it('passes when the sender has enough remaining balance', async () => {
      const { service, deps } = await createService();
      await service.reserveBudget('sender', 20);

      expect(deps.senderBalances.getRemaining).toHaveBeenCalledWith('sender');
    });

    it('rejects insufficient budget when the sender is provisioned but low on budget', async () => {
      const { service, deps } = await createService();
      deps.senderBalances.getRemaining.mockResolvedValue(10);

      await expect(service.reserveBudget('sender', 20)).rejects.toThrow(
        InsufficientBudgetError,
      );
    });

    it('throws when the sender has never been provisioned', async () => {
      const { service, deps } = await createService();
      deps.senderBalances.getRemaining.mockResolvedValue(null);

      await expect(service.reserveBudget('sender', 20)).rejects.toThrow(
        SenderNotProvisionedError,
      );
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
      const { service, deps } = await createService();
      await service.reserveKudoPoints(payload);

      expect(deps.senderBalances.reserve).toHaveBeenCalledWith('sender', 20);
      expect(deps.pointTransfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'transfer-1',
          idempotencyKey: 'request-1',
        }),
      );
      expect(deps.pointLedger.appendGivingDebit).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'sender', points: 20 }),
      );
      expect(deps.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'kudo.debited' }),
      );
    });

    it('is a no-op on redelivery once this idempotency key was already fully processed', async () => {
      const { service, deps } = await createService();
      deps.pointTransfers.findByIdempotencyKey.mockResolvedValue({
        id: 'transfer-1',
        status: 'pending',
      });

      await service.reserveKudoPoints(payload);

      expect(deps.senderBalances.reserve).not.toHaveBeenCalled();
      expect(deps.pointLedger.appendGivingDebit).not.toHaveBeenCalled();
      expect(deps.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('gives up and enqueues kudo.reservation-failed when the atomic reserve loses the race', async () => {
      const { service, deps } = await createService();
      deps.senderBalances.reserve.mockResolvedValue(false);

      await service.reserveKudoPoints(payload);

      expect(deps.pointTransfers.create).not.toHaveBeenCalled();
      expect(deps.pointLedger.appendGivingDebit).not.toHaveBeenCalled();
      expect(deps.outbox.enqueue).toHaveBeenCalledWith(
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
      const { service, deps } = await createService();
      await service.creditKudo(payload);

      expect(deps.pointLedger.appendEarnCredit).toHaveBeenCalledWith({
        userId: 'recipient',
        points: 20,
        transferId: 'transfer-1',
      });
      expect(deps.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kudo:transfer-1:credited',
          topic: 'kudo.credited',
        }),
      );
    });

    it('runs every step inside a single unit of work', async () => {
      const uow = { run: jest.fn((work: () => Promise<unknown>) => work()) };
      const { service } = await createService({
        uow: uow as unknown as UnitOfWork,
      });

      await service.creditKudo(payload);
      expect(uow.run).toHaveBeenCalledTimes(1);
    });
  });
});

interface MockDeps {
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

function createDeps(): MockDeps {
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

async function createService(
  options: { uow?: UnitOfWork } = {},
): Promise<{ service: PointTransferService; deps: MockDeps }> {
  const deps = createDeps();
  const uow =
    options.uow ??
    ({
      run: (work: () => Promise<unknown>) => work(),
    } as unknown as UnitOfWork);

  const module = await Test.createTestingModule({
    providers: [
      PointTransferService,
      { provide: UnitOfWork, useValue: uow },
      { provide: SenderBalanceRepository, useValue: deps.senderBalances },
      { provide: PointTransferRepository, useValue: deps.pointTransfers },
      { provide: PointLedgerRepository, useValue: deps.pointLedger },
      { provide: OutboxRepository, useValue: deps.outbox },
    ],
  }).compile();

  return { service: module.get(PointTransferService), deps };
}
