import type { DomainEvent } from './event-bus.interface';

export interface OutboxMessage extends DomainEvent {
  createdAt: string;
}

export interface OutboxSource {
  nextBatch(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
}
