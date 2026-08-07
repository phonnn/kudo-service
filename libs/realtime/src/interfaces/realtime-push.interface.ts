import type { Observable } from 'rxjs';

export interface RealtimeEvent {
  type: string;
  data: unknown;
}

// Domain-agnostic pub/sub over named "rooms" (§9's terminology) — the tool
// knows nothing about feeds, kudos, or reactions, only that something
// publishes to a room and something else streams that room. Callers own
// what a room name means and what `data` contains.
export interface RealtimePush {
  publish(room: string, event: RealtimeEvent): void;
  stream(room: string): Observable<RealtimeEvent>;
}
