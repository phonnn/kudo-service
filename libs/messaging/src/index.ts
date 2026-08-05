export type { DomainEvent, EventBus } from './interfaces/event-bus.interface';
export type {
  OutboxMessage,
  OutboxSource,
} from './interfaces/outbox.interface';
export type { MessagingConfig } from './messaging.config';
export { createMessaging } from './messaging.factory';
export { OutboxRelay } from './services/outbox-relay.service';
