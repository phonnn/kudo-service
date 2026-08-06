export class SenderNotProvisionedError extends Error {
  readonly code = 'SENDER_NOT_PROVISIONED';

  constructor() {
    super('The sender has no giving budget set up yet.');
  }
}
