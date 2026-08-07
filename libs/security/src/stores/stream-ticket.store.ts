import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Principal } from '../interfaces/auth-provider.interface';

interface TicketEntry {
  principal: Principal;
  expiresAt: number;
}

const TICKET_TTL_MS = 30_000;

// Single-use, short-lived exchange credential for streaming transports
// whose browser API can't set an Authorization header — not SSE-specific;
// a future 'websocket' provider would need this same mechanism unchanged.
//
// Rather than put the real access token in a query string — where it
// leaks into access logs, browser history, and Referer headers — a client
// that already authenticated normally exchanges that for a narrow, 30s,
// one-time ticket, and only the ticket goes in the stream URL. Even a
// logged/captured ticket is worthless a moment later.
//
// In-memory: fine for a single instance; a second instance would need this
// shared (e.g. Redis).
@Injectable()
export class StreamTicketStore {
  private readonly tickets = new Map<string, TicketEntry>();

  issue(principal: Principal): string {
    const ticket = randomUUID();
    this.tickets.set(ticket, {
      principal,
      expiresAt: Date.now() + TICKET_TTL_MS,
    });
    return ticket;
  }

  // Consumed (deleted) whether or not it was valid — a ticket that leaked
  // somewhere can't be replayed even within its own TTL.
  consume(ticket: string): Principal | null {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.principal;
  }
}
