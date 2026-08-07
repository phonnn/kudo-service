import { Test } from '@nestjs/testing';
import { UnitOfWork } from '@kudo/database';
import { AUTH_PROVIDER, type AuthProvider } from '@kudo/security';
import { EmailAlreadyRegisteredError } from '../errors/email-already-registered.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { ReceiverBalanceRepository } from '../../point/repositories/receiver-balance.repository';
import { SenderBalanceRepository } from '../../point/repositories/sender-balance.repository';
import { UserRepository } from '../repositories/user.repository';
import { AuthService } from './auth.service';

/* eslint-disable @typescript-eslint/unbound-method */

const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

describe('AuthService', () => {
  describe('register', () => {
    it('throws when the email is already registered (fast pre-check)', async () => {
      const { service, deps } = await createService();
      deps.users.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        name: 'A',
        passwordHash: 'hash',
      });

      await expect(
        service.register({
          email: 'a@example.com',
          name: 'A',
          password: 'password123',
        }),
      ).rejects.toThrow(EmailAlreadyRegisteredError);
      expect(deps.users.create).not.toHaveBeenCalled();
    });

    it('throws when create() reports a conflict the pre-check missed (concurrent registration), without provisioning balances', async () => {
      const { service, deps } = await createService();
      deps.users.create.mockResolvedValue(null);

      await expect(
        service.register({
          email: 'a@example.com',
          name: 'A',
          password: 'password123',
        }),
      ).rejects.toThrow(EmailAlreadyRegisteredError);
      expect(deps.senderBalances.provision).not.toHaveBeenCalled();
      expect(deps.receiverBalances.provision).not.toHaveBeenCalled();
      expect(deps.authProvider.issueToken).not.toHaveBeenCalled();
    });

    it('hashes the password, creates the user, provisions both balances, and issues tokens', async () => {
      const { service, deps } = await createService();
      deps.users.create.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        name: 'A',
        passwordHash: 'hashed',
      });

      const result = await service.register({
        email: 'a@example.com',
        name: 'A',
        password: 'password123',
      });

      expect(deps.users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@example.com', name: 'A' }),
      );
      const created = deps.users.create.mock.calls[0]?.[0] as {
        passwordHash: string;
      };
      expect(created.passwordHash).not.toBe('password123');
      expect(deps.senderBalances.provision).toHaveBeenCalledWith('user-1');
      expect(deps.receiverBalances.provision).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        userId: 'user-1',
        email: 'a@example.com',
        name: 'A',
        tokens,
      });
    });

    it('provisions balances inside the same unit of work as user creation', async () => {
      const uow = { run: jest.fn((work: () => Promise<unknown>) => work()) };
      const { service } = await createService({
        uow: uow as unknown as UnitOfWork,
      });

      await service.register({
        email: 'a@example.com',
        name: 'A',
        password: 'password123',
      });

      expect(uow.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('throws when there is no user with that email', async () => {
      const { service, deps } = await createService();
      deps.users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow(InvalidCredentialsError);
      expect(deps.authProvider.issueToken).not.toHaveBeenCalled();
    });

    it('throws when the password does not match', async () => {
      const { service, deps } = await createService();
      deps.users.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        name: 'A',
        passwordHash: 'hash',
      });
      deps.authProvider.issueToken.mockRejectedValue(
        new Error('Invalid credentials'),
      );

      await expect(
        service.login({ email: 'a@example.com', password: 'wrong' }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('issues tokens when the password matches', async () => {
      const { service, deps } = await createService();
      deps.users.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        name: 'A',
        passwordHash: 'hash',
      });

      const result = await service.login({
        email: 'a@example.com',
        password: 'correct',
      });

      expect(result).toEqual({
        userId: 'user-1',
        email: 'a@example.com',
        name: 'A',
        tokens,
      });
    });
  });

  describe('refresh', () => {
    it('wraps a refresh failure as InvalidRefreshTokenError', async () => {
      const { service, deps } = await createService();
      deps.authProvider.refreshToken.mockRejectedValue(new Error('expired'));

      await expect(service.refresh('bad-token')).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('returns the fresh token pair on success', async () => {
      const { service } = await createService();
      await expect(service.refresh('good-token')).resolves.toEqual(tokens);
    });
  });
});

interface MockDeps {
  users: jest.Mocked<Pick<UserRepository, 'findByEmail' | 'create'>>;
  senderBalances: jest.Mocked<Pick<SenderBalanceRepository, 'provision'>>;
  receiverBalances: jest.Mocked<Pick<ReceiverBalanceRepository, 'provision'>>;
  authProvider: jest.Mocked<AuthProvider>;
}

function createDeps(): MockDeps {
  return {
    users: {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        name: 'A',
        passwordHash: 'hashed',
      }),
    },
    senderBalances: { provision: jest.fn().mockResolvedValue(undefined) },
    receiverBalances: { provision: jest.fn().mockResolvedValue(undefined) },
    authProvider: {
      issueToken: jest.fn().mockResolvedValue(tokens),
      refreshToken: jest.fn().mockResolvedValue(tokens),
      verifyToken: jest.fn(),
    },
  };
}

async function createService(
  options: { uow?: UnitOfWork } = {},
): Promise<{ service: AuthService; deps: MockDeps }> {
  const deps = createDeps();
  const uow =
    options.uow ??
    ({
      run: (work: () => Promise<unknown>) => work(),
    } as unknown as UnitOfWork);

  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UnitOfWork, useValue: uow },
      { provide: UserRepository, useValue: deps.users },
      { provide: SenderBalanceRepository, useValue: deps.senderBalances },
      { provide: ReceiverBalanceRepository, useValue: deps.receiverBalances },
      { provide: AUTH_PROVIDER, useValue: deps.authProvider },
    ],
  }).compile();

  return { service: module.get(AuthService), deps };
}
