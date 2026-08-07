export type SecurityConfig = {
  provider: 'local';
  accessTokenSecret: string;
  // seconds, or an ms-style duration string ('15m', '7d', ...) — passed
  // straight through to jsonwebtoken's SignOptions.expiresIn.
  accessTokenTtl?: string | number;
  refreshTokenSecret: string;
  refreshTokenTtl?: string | number;
};
