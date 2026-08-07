// Point-to-point room (§9): only the one user's own stream connection(s)
// are in this room, unlike feed's broadcast FEED_ROOM that every viewer
// shares.
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export const NOTIFICATION_CREATED = 'notification.created';
