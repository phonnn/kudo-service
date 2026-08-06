export interface CreatedKudo {
  transferId: string;
  postId: string;
  // 'pending' on a fresh send; an idempotent retry can now also surface
  // 'published' or 'failed' if Phase 1.5/Phase 2 already resolved by the
  // time the retry lands.
  status: 'pending' | 'published' | 'failed';
}
