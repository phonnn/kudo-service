import type { ExecutionContext } from '@nestjs/common';
import type {
  AuthProvider,
  Principal,
} from '../interfaces/auth-provider.interface';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { OptionalAuthGuard } from './optional-auth.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('OptionalAuthGuard', () => {
  it('allows the request through with no principal when there is no token', async () => {
    const authProvider: Pick<AuthProvider, 'verifyToken'> = {
      verifyToken: jest.fn(),
    };
    const guard = new OptionalAuthGuard(authProvider as AuthProvider);
    const request: Partial<AuthenticatedRequest> = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toBeUndefined();
  });

  it('allows the request through with no principal when the token is invalid', async () => {
    const authProvider: Pick<AuthProvider, 'verifyToken'> = {
      verifyToken: jest.fn().mockRejectedValue(new Error('expired')),
    };
    const guard = new OptionalAuthGuard(authProvider as AuthProvider);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer bad-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toBeUndefined();
  });

  it('attaches the principal when the token is valid', async () => {
    const principal: Principal = { subject: 'user-1', claims: {} };
    const authProvider: Pick<AuthProvider, 'verifyToken'> = {
      verifyToken: jest.fn().mockResolvedValue(principal),
    };
    const guard = new OptionalAuthGuard(authProvider as AuthProvider);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer good-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toBe(principal);
  });
});
