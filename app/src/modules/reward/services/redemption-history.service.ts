import { Injectable } from '@nestjs/common';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import {
  RedemptionRepository,
  type RedemptionListCursor,
  type RedemptionListItem,
} from '../repositories/redemption.repository';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface RedemptionHistoryPage {
  items: RedemptionListItem[];
  nextCursor: string | null;
}

@Injectable()
export class RedemptionHistoryService {
  constructor(private readonly redemptions: RedemptionRepository) {}

  async listHistory(
    userId: string,
    limitInput: number | undefined,
    cursorInput: string | undefined,
  ): Promise<RedemptionHistoryPage> {
    const limit = Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = cursorInput ? decodeCursor(cursorInput) : null;

    const items = await this.redemptions.listForUser(userId, limit, cursor);

    const last = items[items.length - 1];
    const nextCursor =
      items.length === limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { items, nextCursor };
  }
}

function encodeCursor(cursor: RedemptionListCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

function decodeCursor(value: string): RedemptionListCursor {
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
