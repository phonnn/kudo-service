export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  occurredAt: string;
  payload: T;
}

export type EventHandler<T = Record<string, unknown>> = (
  event: DomainEvent<T>,
) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  /**
   * Registers `handler` as its own durable consumer group (`groupName`), so
   * every subscriber gets its own copy of the stream regardless of how many
   * other groups are also reading it. Delivery is at-least-once — handlers
   * must be idempotent (P6).
   */
  subscribe(
    topic: string,
    groupName: string,
    handler: EventHandler,
  ): Promise<void>;
  close(): Promise<void>;
}
