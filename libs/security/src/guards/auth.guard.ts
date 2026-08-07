import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthProvider } from '../interfaces/auth-provider.interface';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AUTH_PROVIDER } from '../tokens';
import { extractBearerToken } from './extract-bearer-token';

// Provider-agnostic — swapping local for Cognito is a config change, not a
// guard change.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.principal = await this.authProvider.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }
}
