import type { Kysely, Transaction } from 'kysely';

export interface Database {
  client<Schema>(): Kysely<Schema>;
  transaction<Schema, Result>(
    work: (transaction: Transaction<Schema>) => Promise<Result>,
  ): Promise<Result>;
  close(): Promise<void>;
}
