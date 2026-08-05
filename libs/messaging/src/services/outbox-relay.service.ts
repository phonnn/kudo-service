import type { EventBus } from '../interfaces/event-bus.interface';
import type { OutboxSource } from '../interfaces/outbox.interface';

export class OutboxRelay {
  constructor(
    private readonly source: OutboxSource,
    private readonly bus: EventBus,
  ) {}
  async flush(limit = 100): Promise<number> {
    const messages = await this.source.nextBatch(limit);
    for (const message of messages) {
      await this.bus.publish(message);
      await this.source.markPublished(message.id);
    }
    return messages.length;
  }
}
