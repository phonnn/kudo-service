import {
  Controller,
  Inject,
  MessageEvent,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CurrentPrincipal,
  StreamTicketGuard,
  type Principal,
} from '@kudo/security';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { userRoom } from '../events/realtime-room';

const HEARTBEAT_INTERVAL_MS = 20_000;

// Point-to-point counterpart to feed's GET /kudos/events — same
// StreamTicketGuard/ticket-exchange flow (EventSource can't set an
// Authorization header), but subscribed to this one user's own room
// instead of the shared feed broadcast room.
@UseGuards(StreamTicketGuard)
@Controller('notifications')
export class NotificationEventsController {
  constructor(@Inject(REALTIME_PUSH) private readonly realtime: RealtimePush) {}

  @Sse('events')
  events(@CurrentPrincipal() principal: Principal): Observable<MessageEvent> {
    const room = userRoom(principal.subject);

    const notifications$ = this.realtime.stream(room).pipe(
      map((event): MessageEvent => ({
        type: event.type,
        data: event.data as object,
      })),
    );

    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(notifications$, heartbeat$);
  }
}
