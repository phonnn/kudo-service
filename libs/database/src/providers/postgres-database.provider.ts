import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
import type { Database } from '../interfaces/database.interface';
import type { DatabaseConfig } from '../database.config';

export class PostgresDatabase implements Database {
  private readonly database: Kysely<Record<string, never>>;
  private readonly transactionContext = new AsyncLocalStorage<
    Transaction<Record<string, never>>
  >();

  constructor(config: Extract<DatabaseConfig, { provider: 'postgres' }>) {
    this.database = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: config.url, max: config.poolSize }),
      }),
    });
  }

  client<Schema>(): Kysely<Schema> {
    const activeTransaction = this.transactionContext.getStore();
    return (activeTransaction ?? this.database) as unknown as Kysely<Schema>;
  }

  async transaction<Schema, Result>(
    work: (transaction: Transaction<Schema>) => Promise<Result>,
  ): Promise<Result> {
    const activeTransaction = this.transactionContext.getStore();
    if (activeTransaction) {
      return work(activeTransaction as unknown as Transaction<Schema>);
    }
    return this.database
      .transaction()
      .execute((transaction) =>
        this.transactionContext.run(transaction, () =>
          work(transaction as unknown as Transaction<Schema>),
        ),
      );
  }

  async close(): Promise<void> {
    await this.database.destroy();
  }
}
