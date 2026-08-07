import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { DomainEvent, EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import { KUDO_RESERVED, type KudoReservedPayload } from '../events/kudo.events';
import { PointTransferService } from '../services/point-transfer.service';

const CONSUMER_GROUP = 'kudo-reserve-consumer';

@Injectable()
export class KudoReservedListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly pointTransfers: PointTransferService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(KUDO_RESERVED, CONSUMER_GROUP, (event) =>
      this.handle(event as unknown as DomainEvent<KudoReservedPayload>),
    );
  }

  private handle(event: DomainEvent<KudoReservedPayload>): Promise<void> {
    return this.pointTransfers.reserveKudoPoints(event.payload);
  }
}
