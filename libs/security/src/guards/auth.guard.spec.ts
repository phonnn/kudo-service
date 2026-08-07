import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type {
  AuthProvider,
  Principal,
} from '../interfaces/auth-provider.interface';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AuthGuard } from './auth.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  it('throws when there is no bearer token', async () => {
    const authProvider: Pick<AuthProvider, 'verifyToken'> = {
      verifyToken: jest.fn(),
    };
    const guard = new AuthGuard(authProvider as AuthProvider);

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
    expect(authProvider.verifyToken).not.toHaveBeenCalled();
  });

  it('throws when the token fails verification', async () => {
    const authProvider: Pick<AuthProvider, 'verifyToken'> = {
      verifyToken: jest.fn().mockRejectedValue(new Error('expired')),
    };
    const guard = new AuthGuard(authProvider as AuthProvider);

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer bad-token' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the principal and allows the request through on a valid token', async () => {
    const principal: Principal = { subject: 'user-1', claims: {} };
    const authProvider: Pick<AuthProvider, 'verifyToken'> = {
      verifyToken: jest.fn().mockResolvedValue(principal),
    };
    const guard = new AuthGuard(authProvider as AuthProvider);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer good-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(authProvider.verifyToken).toHaveBeenCalledWith('good-token');
    expect(request.principal).toBe(principal);
  });
});
