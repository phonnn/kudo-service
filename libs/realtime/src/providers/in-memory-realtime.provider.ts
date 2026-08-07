import { Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type {
  RealtimeEvent,
  RealtimePush,
} from '../interfaces/realtime-push.interface';

interface RoomEvent {
  room: string;
  event: RealtimeEvent;
}

// In-memory, single-process broadcaster: every publish/stream within this
// instance shares one RxJS Subject, filtered per room on the way out.
// NestJS's @Sse() decorator subscribes/unsubscribes automatically as
// clients connect/disconnect, so there's no manual connection list to
// maintain (ARCHITECTURE.md §9's "instance keeps an in-memory userId →
// open streams map" is handled by RxJS's subscription lifecycle instead).
// No cross-instance fan-out — see RedisRealtimePush for that; this
// provider is correct only when there's exactly one app instance.
export class InMemoryRealtimePush implements RealtimePush {
  private readonly subject = new Subject<RoomEvent>();

  publish(room: string, event: RealtimeEvent): void {
    this.subject.next({ room, event });
  }

  stream(room: string) {
    return this.subject.asObservable().pipe(
      filter((entry) => entry.room === room),
      map((entry) => entry.event),
    );
  }
}
