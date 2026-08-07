import { createClient, RedisClientType } from 'redis';
import { Observable } from 'rxjs';
import type {
  RealtimeEvent,
  RealtimePush,
} from '../interfaces/realtime-push.interface';
import type { RealtimeConfig } from '../realtime.config';

const DEFAULT_CHANNEL_PREFIX = 'realtime:';

// Cross-instance fan-out via Redis Pub/Sub, not Streams — there's nothing
// to replay or ack here; a message with no subscriber listening is simply
// gone, which is fine for a best-effort realtime accelerant.
//
// Needs two connections, not one: node-redis puts a client that's issued
// SUBSCRIBE into a mode where it can't run other commands, so publishing
// and subscribing each get their own connection via duplicate().
export class RedisRealtimePush implements RealtimePush {
  private readonly publisher: RedisClientType;
  private readonly subscriber: RedisClientType;
  private readonly channelPrefix: string;
  private connectPromise?: Promise<void>;

  constructor(config: Extract<RealtimeConfig, { provider: 'redis' }>) {
    this.publisher = createClient({ url: config.url });
    this.subscriber = this.publisher.duplicate();
    this.channelPrefix = config.channelPrefix ?? DEFAULT_CHANNEL_PREFIX;
    this.publisher.on('error', (error) =>
      console.error('Redis realtime publisher error', error),
    );
    this.subscriber.on('error', (error) =>
      console.error('Redis realtime subscriber error', error),
    );
  }

  publish(room: string, event: RealtimeEvent): void {
    void this.connect().then(() =>
      this.publisher.publish(this.channel(room), JSON.stringify(event)),
    );
  }

  stream(room: string): Observable<RealtimeEvent> {
    const channel = this.channel(room);

    return new Observable((subscriber) => {
      const listener = (message: string) => {
        try {
          subscriber.next(JSON.parse(message) as RealtimeEvent);
        } catch (error) {
          console.error('Failed to parse realtime event', error);
        }
      };

      void this.connect().then(() =>
        this.subscriber.subscribe(channel, listener),
      );

      return () => {
        void this.subscriber.unsubscribe(channel, listener);
      };
    });
  }

  private channel(room: string): string {
    return `${this.channelPrefix}${room}`;
  }

  private async connect(): Promise<void> {
    this.connectPromise ??= Promise.all([
      this.publisher.isOpen ? Promise.resolve() : this.publisher.connect(),
      this.subscriber.isOpen ? Promise.resolve() : this.subscriber.connect(),
    ]).then(() => undefined);
    await this.connectPromise;
  }
}
