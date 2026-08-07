import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_PROVIDER,
  hashValue,
  type AuthProvider,
  type TokenPair,
} from '@kudo/security';
import { EmailAlreadyRegisteredError } from '../errors/email-already-registered.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { UserRepository } from '../repositories/user.repository';

export interface RegisterCommand {
  email: string;
  password: string;
}

export interface LoginCommand {
  email: string;
  password: string;
}

export interface AuthResult {
  userId: string;
  email: string;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async register(command: RegisterCommand): Promise<AuthResult> {
    // fast-path check before paying for scrypt's CPU cost; create()'s
    // onConflict is what's actually authoritative against a concurrent
    // registration of the same email (same shape as RedeemRewardService's
    // pre-check vs. its atomic write).
    const existing = await this.users.findByEmail(command.email);
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await hashValue(command.password);
    const user = await this.users.create({
      email: command.email,
      passwordHash,
    });
    if (!user) {
      throw new EmailAlreadyRegisteredError();
    }

    const tokens = await this.authProvider.issueToken({
      subject: user.id,
      claims: { email: user.email },
    });

    return { userId: user.id, email: user.email, tokens };
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
        claims: { email: user.email },
        password: command.password,
        passwordHash: user.passwordHash,
      });
    } catch {
      throw new InvalidCredentialsError();
    }

    return { userId: user.id, email: user.email, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      return await this.authProvider.refreshToken(refreshToken);
    } catch {
      throw new InvalidRefreshTokenError();
    }
  }
}
