export class InvalidCredentialsError extends Error {
  readonly code = 'INVALID_CREDENTIALS';
  constructor() {
    // deliberately the same message whether the email or the password was
    // wrong — distinguishing them lets an attacker enumerate registered emails
    super('Email or password is incorrect.');
  }
}
