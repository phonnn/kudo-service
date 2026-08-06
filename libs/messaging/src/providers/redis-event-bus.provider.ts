import { randomUUID } from 'node:crypto';
import { createClient, RedisClientType } from 'redis';
import type {
  DomainEvent,
  EventBus,
  EventHandler,
} from '../interfaces/event-bus.interface';
import type { MessagingConfig } from '../messaging.config';

export class RedisEventBus implements EventBus {
  private readonly client: RedisClientType;
  private readonly stream: string;
  private connectPromise?: Promise<void>;
  private closed = false;

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

  async subscribe(
    topic: string,
    groupName: string,
    handler: EventHandler,
  ): Promise<void> {
    await this.connect();
    await this.ensureGroup(groupName);
    const consumerName = `${groupName}-${randomUUID()}`;
    void this.consume(topic, groupName, consumerName, handler);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.client.isOpen) await this.client.quit();
  }

  private async connect(): Promise<void> {
    if (this.client.isOpen) return;
    this.connectPromise ??= this.client.connect().then(() => undefined);
    await this.connectPromise;
  }

  private async ensureGroup(groupName: string): Promise<void> {
    try {
      await this.client.xGroupCreate(this.stream, groupName, '0', {
        MKSTREAM: true,
      });
    } catch (error) {
      const alreadyExists =
        error instanceof Error && error.message.includes('BUSYGROUP');
      if (!alreadyExists) throw error;
    }
  }

  private async consume(
    topic: string,
    groupName: string,
    consumerName: string,
    handler: EventHandler,
  ): Promise<void> {
    while (!this.closed) {
      const response = await this.client
        .xReadGroup(
          groupName,
          consumerName,
          { key: this.stream, id: '>' },
          { COUNT: 10, BLOCK: 5000 },
        )
        .catch((error: unknown) => {
          console.error(`Consumer group ${groupName} read failed`, error);
          return null;
        });
      if (!response) continue;

      for (const { messages } of response) {
        for (const { id, message } of messages) {
          await this.handleMessage(topic, groupName, id, message, handler);
        }
      }
    }
  }

  private async handleMessage(
    topic: string,
    groupName: string,
    messageId: string,
    fields: Record<string, string>,
    handler: EventHandler,
  ): Promise<void> {
    if (fields.type !== topic) {
      await this.client.xAck(this.stream, groupName, messageId);
      return;
    }
    try {
      await handler({
        id: fields.id,
        type: fields.type,
        occurredAt: fields.occurredAt,
        payload: JSON.parse(fields.payload) as Record<string, unknown>,
      });
      await this.client.xAck(this.stream, groupName, messageId);
    } catch (error) {
      console.error(
        `Handler for topic ${topic} (group ${groupName}) failed`,
        error,
      );
    }
  }
}
