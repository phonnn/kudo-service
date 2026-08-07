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

// In-memory, single-process broadcaster — every publish/stream within
// this instance shares one RxJS Subject, filtered per room. No
// cross-instance fan-out; correct only when there's exactly one app
// instance.
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
