import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import { KUDO_DEBITED, type KudoDebitedPayload } from '../events/kudo.events';
import { PointTransferService } from '../services/point-transfer.service';

const CONSUMER_GROUP = 'kudo-credit-consumer';

@Injectable()
export class KudoDebitedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly pointTransfers: PointTransferService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(KUDO_DEBITED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<KudoDebitedPayload>),
    );
  }

  private handle(event: DomainEvent<KudoDebitedPayload>): Promise<void> {
    return this.pointTransfers.creditKudo(event.payload);
  }
}
