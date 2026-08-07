export const KUDO_RESERVED = 'kudo.reserved';
export const KUDO_RESERVATION_FAILED = 'kudo.reservation-failed';
export const KUDO_DEBITED = 'kudo.debited';
export const KUDO_CREDITED = 'kudo.credited';

export interface KudoReservedPayload {
  transferId: string;
  postId: string;
  senderId: string;
  recipientId: string;
  points: number;
  idempotencyKey: string;
}

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
  senderId: string;
  recipientId: string;
  points: number;
}
