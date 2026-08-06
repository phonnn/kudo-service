import type { CoreValue } from '../dto/core-value.enum';

export const KUDO_RESERVED = 'kudo.reserved';
export const KUDO_RESERVATION_FAILED = 'kudo.reservation-failed';
export const KUDO_DEBITED = 'kudo.debited';
export const KUDO_CREDITED = 'kudo.credited';

// emitted once feed_post exists and the sender's budget passed a quick,
// unlocked pre-check (§4 Phase 1) — NOT yet reserved; the actual atomic
// reserve happens in reserveKudoPoints() (Phase 1.5), in the same
// transaction as the ledger debit. Everything KudoReservedListener needs to
// attempt that, without re-deriving anything from feed_post.
export interface KudoReservedPayload {
  transferId: string;
  postId: string;
  senderId: string;
  recipientId: string;
  points: number;
  coreValue: CoreValue;
  idempotencyKey: string;
}

// emitted when Phase 1.5's atomic reserve loses a race the Phase 1
// pre-check didn't catch (§4) — feed's own listener reacts by marking its
// post 'failed'; point never touches feed_post directly (§12).
export interface KudoReservationFailedPayload {
  transferId: string;
}

export interface KudoDebitedPayload {
  transferId: string;
  postId: string;
  senderId: string;
  recipientId: string;
  points: number;
}

export interface KudoCreditedPayload {
  transferId: string;
  postId: string;
  recipientId: string;
  points: number;
}
