import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { StreamTicketStore } from '../stores/stream-ticket.store';

// Reads `?ticket=` instead of an Authorization header. Never accepts a raw
// bearer token from the URL — only a ticket minted by
// StreamTicketStore.issue().
@Injectable()
export class StreamTicketGuard implements CanActivate {
  constructor(private readonly tickets: StreamTicketStore) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ticket = request.query?.ticket;
    if (typeof ticket !== 'string') {
      throw new UnauthorizedException('Missing ticket');
    }

    const principal = this.tickets.consume(ticket);
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired ticket');
    }

    request.principal = principal;
    return true;
  }
}
