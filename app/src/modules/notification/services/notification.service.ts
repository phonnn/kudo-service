import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import type { NotificationType } from '../dto/notification-type.enum';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { NOTIFICATION_CREATED, userRoom } from '../events/realtime-room';
import {
  NotificationRepository,
  type NotificationListCursor,
  type NotificationRecord,
} from '../repositories/notification.repository';

export interface NotifyCommand {
  userId: string;
  type: NotificationType;
  refId: string;
  payload: Record<string, unknown>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface NotificationPage {
  items: NotificationRecord[];
  nextCursor: string | null;
}

// §9/P7's "persist-then-push," the one place it's implemented: the DB row
// is the durable source of truth, written first; the realtime push to
// user:{id} is best-effort acceleration on top of it, sent only if the
// row was actually new (never push a duplicate for a deduped notify()).
// Offline → row persists, client fetches unread via listForUser on next
// connect. Nothing is lost; the live push is purely an accelerant.
@Injectable()
export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    @Inject(REALTIME_PUSH) private readonly realtime: RealtimePush,
  ) {}

  async notify(command: NotifyCommand): Promise<void> {
    const created = await this.notifications.create({
      id: randomUUID(),
      userId: command.userId,
      type: command.type,
      refId: command.refId,
      payload: command.payload,
    });
    if (!created) return; // deduped — a prior delivery already notified

    this.realtime.publish(userRoom(command.userId), {
      type: NOTIFICATION_CREATED,
      data: created,
    });
  }

  async listForUser(
    userId: string,
    limitInput: number | undefined,
    cursorInput: string | undefined,
  ): Promise<NotificationPage> {
    const limit = Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = cursorInput ? decodeCursor(cursorInput) : null;

    const items = await this.notifications.listForUser(userId, limit, cursor);

    const last = items[items.length - 1];
    const nextCursor =
      items.length === limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { items, nextCursor };
  }

  markRead(id: string, userId: string): Promise<boolean> {
    return this.notifications.markRead(id, userId);
  }
}

function encodeCursor(cursor: NotificationListCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

function decodeCursor(value: string): NotificationListCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { createdAt: string; id: string };

    const createdAt = new Date(decoded.createdAt);
    if (!decoded.id || Number.isNaN(createdAt.getTime())) {
      throw new Error('malformed cursor payload');
    }

    return { createdAt, id: decoded.id };
  } catch {
    throw new InvalidCursorError();
  }
}
