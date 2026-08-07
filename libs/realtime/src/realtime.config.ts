// The axis that varies here is the fan-out backend (how a publish on one
// app instance reaches a client connected to another), not the client
// wire protocol (SSE vs WebSocket) — those are orthogonal: RealtimePush's
// publish/stream interface is already transport-agnostic, and which
// client protocol is used is an app-layer controller decision
// (@Sse() vs a gateway), unrelated to this config.
export type RealtimeConfig =
  | { provider: 'memory' }
  | { provider: 'redis'; url: string; channelPrefix?: string };
