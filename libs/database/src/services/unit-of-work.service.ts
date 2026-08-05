import type { Database } from '../interfaces/database.interface';

export class UnitOfWork {
  constructor(private readonly database: Database) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transaction<Record<string, never>, T>(work);
  }
}
