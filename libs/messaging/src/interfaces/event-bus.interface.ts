export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  occurredAt: string;
  payload: T;
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  close(): Promise<void>;
}
