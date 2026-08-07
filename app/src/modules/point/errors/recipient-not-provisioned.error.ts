export class RecipientNotProvisionedError extends Error {
  readonly code = 'RECIPIENT_NOT_PROVISIONED';

  constructor() {
    super('The recipient has no earned-balance row set up yet.');
  }
}
