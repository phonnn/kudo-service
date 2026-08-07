export class InvalidRefreshTokenError extends Error {
  readonly code = 'INVALID_REFRESH_TOKEN';
  constructor() {
    super('Refresh token is missing, expired, or invalid.');
  }
}
