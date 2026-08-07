import type { Observable } from 'rxjs';

export interface RealtimeEvent {
  type: string;
  data: unknown;
}

// Domain-agnostic pub/sub over named rooms — callers own what a room name
// means and what `data` contains.
export interface RealtimePush {
  publish(room: string, event: RealtimeEvent): void;
  stream(room: string): Observable<RealtimeEvent>;
}
