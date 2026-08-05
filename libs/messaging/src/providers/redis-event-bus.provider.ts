import { createClient, RedisClientType } from 'redis';
import type { DomainEvent, EventBus } from '../interfaces/event-bus.interface';
import type { MessagingConfig } from '../messaging.config';

export class RedisEventBus implements EventBus {
  private readonly client: RedisClientType;
  private readonly stream: string;
  private connectPromise?: Promise<void>;

  constructor(config: Extract<MessagingConfig, { provider: 'redis' }>) {
    this.client = createClient({ url: config.url });
    this.stream = config.stream ?? 'kudo:events';
    this.client.on('error', (error) =>
      console.error('Redis event bus error', error),
    );
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.connect();
    await this.client.xAdd(this.stream, '*', {
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      payload: JSON.stringify(event.payload),
    });
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async connect(): Promise<void> {
    if (this.client.isOpen) return;
    this.connectPromise ??= this.client.connect().then(() => undefined);
    await this.connectPromise;
  }
}
