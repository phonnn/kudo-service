import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { AuthProvider } from '../interfaces/auth-provider.interface';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AUTH_PROVIDER } from '../tokens';
import { extractBearerToken } from './extract-bearer-token';

// Never blocks the request: attaches `principal` when a token is present
// and valid, leaves it undefined otherwise (missing, malformed, expired).
// Routes read `request.principal` to tell an authenticated caller from an
// anonymous one.
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) return true;

    try {
      request.principal = await this.authProvider.verifyToken(token);
    } catch {
      // invalid/expired token on an optional route: treat as anonymous
    }

    return true;
  }
}
