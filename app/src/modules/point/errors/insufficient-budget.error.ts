export class InsufficientBudgetError extends Error {
  readonly code = 'INSUFFICIENT_BUDGET';
  constructor() {
    super('The sender does not have enough giving budget for this kudo.');
  }
}
