import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OutboxRelay, type EventBus } from '@kudo/messaging';
import { EVENT_BUS } from '../infra/token.constant';
import { OutboxRepository } from '../modules/outbox';

@Injectable()
export class OutboxRelayWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly relay: OutboxRelay;
  private timer?: NodeJS.Timeout;
  private flushing = false;
  constructor(
    source: OutboxRepository,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {
    this.relay = new OutboxRelay(source, bus);
  }
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.flush(), 500);
    this.timer.unref();
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.bus.close();
  }
  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.relay.flush();
    } catch (error) {
      console.error('Outbox relay failed', error);
    } finally {
      this.flushing = false;
    }
  }
}
