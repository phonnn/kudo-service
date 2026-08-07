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

// §9: live feed is server→client only (client actions — react, comment,
// send — all go through normal REST, never up this stream), which is
// exactly what makes SSE a fit rather than a compromise. StreamTicketGuard
// (not AuthGuard) here — EventSource can't set an Authorization header, so
// the client first calls POST /auth/stream-ticket normally (real header),
// then connects as `/kudos/events?ticket=<ticket>`. See StreamTicketStore
// for why that's a short-lived single-use ticket and not the real access
// token — and why it's not named after SSE even though SSE is the only
// transport using it today.
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

    // periodic no-op event, not a raw SSE comment (Nest's MessageEvent has
    // no comment-line escape hatch) — any write resets an idle proxy's
    // timeout just as well; clients simply don't listen for 'heartbeat'.
    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(feedEvents$, heartbeat$);
  }
}
