import {
  Controller,
  Inject,
  MessageEvent,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StreamTicketGuard } from '@kudo/security';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { FEED_ROOM } from '../events/realtime-events';

const HEARTBEAT_INTERVAL_MS = 20_000;

// StreamTicketGuard, not AuthGuard — EventSource can't set an Authorization
// header, so the client exchanges a short-lived ticket via POST
// /auth/stream-ticket first, then connects with ?ticket=<ticket>.
@UseGuards(StreamTicketGuard)
@Controller('kudos')
export class FeedEventsController {
  constructor(@Inject(REALTIME_PUSH) private readonly realtime: RealtimePush) {}

  @Sse('events')
  events(): Observable<MessageEvent> {
    const feedEvents$ = this.realtime.stream(FEED_ROOM).pipe(
      map((event): MessageEvent => ({
        type: event.type,
        data: event.data as object,
      })),
    );

    // A real event, not an SSE comment line — Nest's MessageEvent has no
    // comment escape hatch, but any write resets an idle proxy's timeout
    // just as well; clients simply don't listen for 'heartbeat'.
    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(feedEvents$, heartbeat$);
  }
}
