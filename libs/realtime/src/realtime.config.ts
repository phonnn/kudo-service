// This governs the fan-out backend only (how a publish reaches another
// instance) — client wire protocol (SSE vs WebSocket) is a separate,
// app-layer concern.
export type RealtimeConfig =
  | { provider: 'memory' }
  | { provider: 'redis'; url: string; channelPrefix?: string };
