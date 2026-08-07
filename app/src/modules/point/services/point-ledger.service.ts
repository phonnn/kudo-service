import { Injectable } from '@nestjs/common';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import {
  PointLedgerRepository,
  type PointLedgerListItem,
} from '../repositories/point-ledger.repository';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface PointHistoryPage {
  items: PointLedgerListItem[];
  nextCursor: string | null;
}

@Injectable()
export class PointLedgerService {
  constructor(private readonly ledger: PointLedgerRepository) {}

  async listHistory(
    userId: string,
    limitInput: number | undefined,
    cursorInput: string | undefined,
  ): Promise<PointHistoryPage> {
    const limit = Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = cursorInput ? decodeCursor(cursorInput) : null;

    const items = await this.ledger.listForUser(userId, limit, cursor);

    const last = items[items.length - 1];
    const nextCursor =
      items.length === limit && last ? encodeCursor(last.id) : null;

    return { items, nextCursor };
  }
}

function encodeCursor(id: number): string {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}

function decodeCursor(value: string): number {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { id: number };

    if (!Number.isFinite(decoded.id)) {
      throw new Error('malformed cursor payload');
    }
    return decoded.id;
  } catch {
    throw new InvalidCursorError();
  }
}
