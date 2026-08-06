export const KUDO_DEBITED = 'kudo.debited';
export const KUDO_CREDITED = 'kudo.credited';

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
