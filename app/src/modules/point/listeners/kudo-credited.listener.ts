import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import { KUDO_CREDITED, type KudoCreditedPayload } from '../events/kudo.events';
import { PointTransferRepository } from '../repositories/point-transfer.repository';
import { ReceiverBalanceService } from '../services/receiver-balance.service';

const CONSUMER_GROUP = 'point-transfer-complete-consumer';

@Injectable()
export class KudoCreditedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly unitOfWork: UnitOfWork,
    private readonly receiverBalanceService: ReceiverBalanceService,
    private readonly pointTransfers: PointTransferRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(KUDO_CREDITED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<KudoCreditedPayload>),
    );
  }

  // the transfer is only marked complete once the recipient's displayed
  // balance reflects it — completion means "fully settled," not just "ledger has it"
  private handle(event: DomainEvent<KudoCreditedPayload>): Promise<void> {
    const { transferId, recipientId } = event.payload;
    return this.unitOfWork.run(async () => {
      await this.receiverBalanceService.syncFromLedger(recipientId);
      await this.pointTransfers.markCompleted(transferId);
    });
  }
}
