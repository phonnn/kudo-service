export interface CreatedKudo {
  transferId: string;
  postId: string;
  // 'pending' on a fresh send; an idempotent retry can also surface
  // 'published' or 'failed' if that already resolved by the time the
  // retry lands.
  status: 'pending' | 'published' | 'failed';
}
