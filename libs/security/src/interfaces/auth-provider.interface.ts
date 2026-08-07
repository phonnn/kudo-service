export interface Principal {
  subject: string;
  claims: Record<string, unknown>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IssueTokenParams {
  subject: string;
  claims?: Record<string, unknown>;
  password?: string;
  passwordHash?: string;
}

export interface AuthProvider {
  issueToken(params: IssueTokenParams): Promise<TokenPair>;
  refreshToken(refreshToken: string): Promise<TokenPair>;
  verifyToken(accessToken: string): Promise<Principal>;
}
