import jwt, { type SignOptions } from 'jsonwebtoken';
import type {
  AuthProvider,
  IssueTokenParams,
  Principal,
  TokenPair,
} from '../interfaces/auth-provider.interface';
import type { SecurityConfig } from '../security.config';
import { verifyValue } from '../helpers/hash.helper';

type LocalConfig = Extract<SecurityConfig, { provider: 'local' }>;

interface LocalTokenPayload {
  sub: string;
  claims: Record<string, unknown>;
}

const DEFAULT_ACCESS_TOKEN_TTL = '15m';
const DEFAULT_REFRESH_TOKEN_TTL = '7d';

// Access and refresh tokens use separate secrets so a leaked access token
// can't be replayed as a refresh token.
export class LocalAuthProvider implements AuthProvider {
  constructor(private readonly config: LocalConfig) {}

  // If `password` is present, this is a login, not a trusted re-issue —
  // check it against `passwordHash` before signing anything. Callers that
  // already know `subject` is good simply omit `password`.
  async issueToken(params: IssueTokenParams): Promise<TokenPair> {
    if (params.password !== undefined) {
      const matches =
        !!params.passwordHash &&
        (await verifyValue(params.password, params.passwordHash));
      if (!matches) {
        throw new Error('Invalid credentials');
      }
    }

    return this.sign(params);
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verify(
      refreshToken,
      this.config.refreshTokenSecret,
    );
    return this.sign({ subject: payload.sub, claims: payload.claims });
  }

  async verifyToken(accessToken: string): Promise<Principal> {
    const payload = await this.verify(
      accessToken,
      this.config.accessTokenSecret,
    );
    return { subject: payload.sub, claims: payload.claims };
  }

  private sign(params: IssueTokenParams): TokenPair {
    const payload: LocalTokenPayload = {
      sub: params.subject,
      claims: params.claims ?? {},
    };

    return {
      accessToken: jwt.sign(payload, this.config.accessTokenSecret, {
        expiresIn: (this.config.accessTokenTtl ??
          DEFAULT_ACCESS_TOKEN_TTL) as SignOptions['expiresIn'],
      }),
      refreshToken: jwt.sign(payload, this.config.refreshTokenSecret, {
        expiresIn: (this.config.refreshTokenTtl ??
          DEFAULT_REFRESH_TOKEN_TTL) as SignOptions['expiresIn'],
      }),
    };
  }

  private verify(token: string, secret: string): Promise<LocalTokenPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, secret, (error, decoded) => {
        if (error || !decoded) {
          reject(error ?? new Error('Token verification failed'));
          return;
        }
        resolve(decoded as LocalTokenPayload);
      });
    });
  }
}
