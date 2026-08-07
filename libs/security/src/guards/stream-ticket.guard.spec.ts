import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '../interfaces/auth-provider.interface';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { StreamTicketStore } from '../stores/stream-ticket.store';
import { StreamTicketGuard } from './stream-ticket.guard';

function contextFor(
  request: Partial<AuthenticatedRequest> & { query?: Record<string, unknown> },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('StreamTicketGuard', () => {
  it('throws when there is no ticket query param', () => {
    const tickets = { consume: jest.fn() };
    const guard = new StreamTicketGuard(
      tickets as unknown as StreamTicketStore,
    );

    expect(() => guard.canActivate(contextFor({ query: {} }))).toThrow(
      UnauthorizedException,
    );
    expect(tickets.consume).not.toHaveBeenCalled();
  });

  it('throws when the ticket is invalid or expired', () => {
    const tickets = { consume: jest.fn().mockReturnValue(null) };
    const guard = new StreamTicketGuard(
      tickets as unknown as StreamTicketStore,
    );

    expect(() =>
      guard.canActivate(contextFor({ query: { ticket: 'bad-ticket' } })),
    ).toThrow(UnauthorizedException);
  });

  it('attaches the principal and allows the request through on a valid ticket', () => {
    const principal: Principal = { subject: 'user-1', claims: {} };
    const tickets = { consume: jest.fn().mockReturnValue(principal) };
    const guard = new StreamTicketGuard(
      tickets as unknown as StreamTicketStore,
    );
    const request: Partial<AuthenticatedRequest> & {
      query?: Record<string, unknown>;
    } = { query: { ticket: 'good-ticket' } };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(tickets.consume).toHaveBeenCalledWith('good-ticket');
    expect(request.principal).toBe(principal);
  });
});
