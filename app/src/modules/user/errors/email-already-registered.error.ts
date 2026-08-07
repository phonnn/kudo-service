export class EmailAlreadyRegisteredError extends Error {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  constructor() {
    super('An account with this email already exists.');
  }
}
