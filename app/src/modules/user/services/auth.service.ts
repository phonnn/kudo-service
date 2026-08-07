import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import {
  AUTH_PROVIDER,
  hashValue,
  type AuthProvider,
  type TokenPair,
} from '@kudo/security';
import { EmailAlreadyRegisteredError } from '../errors/email-already-registered.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { ReceiverBalanceRepository } from '../../point/repositories/receiver-balance.repository';
import { SenderBalanceRepository } from '../../point/repositories/sender-balance.repository';
import { UserRepository } from '../repositories/user.repository';

export interface RegisterCommand {
  email: string;
  name: string;
  password: string;
}

export interface LoginCommand {
  email: string;
  password: string;
}

export interface AuthResult {
  userId: string;
  email: string;
  name: string;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly users: UserRepository,
    private readonly senderBalances: SenderBalanceRepository,
    private readonly receiverBalances: ReceiverBalanceRepository,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async register(command: RegisterCommand): Promise<AuthResult> {
    // Fast-path check before paying for scrypt's CPU cost — create()'s
    // onConflict is what's actually authoritative against a concurrent
    // registration of the same email.
    const existing = await this.users.findByEmail(command.email);
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await hashValue(command.password);
    const user = await this.unitOfWork.run(async () => {
      const created = await this.users.create({
        email: command.email,
        name: command.name,
        passwordHash,
      });
      if (!created) return null;

      await this.senderBalances.provision(created.id);
      await this.receiverBalances.provision(created.id);
      return created;
    });
    if (!user) {
      throw new EmailAlreadyRegisteredError();
    }

    const tokens = await this.authProvider.issueToken({
      subject: user.id,
      claims: { email: user.email, name: user.name },
    });

    return { userId: user.id, email: user.email, name: user.name, tokens };
  }

  async login(command: LoginCommand): Promise<AuthResult> {
    const user = await this.users.findByEmail(command.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    let tokens: TokenPair;
    try {
      tokens = await this.authProvider.issueToken({
        subject: user.id,
        claims: { email: user.email, name: user.name },
        password: command.password,
        passwordHash: user.passwordHash,
      });
    } catch {
      throw new InvalidCredentialsError();
    }

    return { userId: user.id, email: user.email, name: user.name, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      return await this.authProvider.refreshToken(refreshToken);
    } catch {
      throw new InvalidRefreshTokenError();
    }
  }
}
