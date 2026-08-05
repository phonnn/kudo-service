import { Global, Module } from '@nestjs/common';
import { createMessaging } from '@kudo/messaging';
import { createDatabase, type Database, UnitOfWork } from '@kudo/database';
import { DATABASE, EVENT_BUS } from './token.constant';
import { databaseConfig, messagingConfig } from './infra.config';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => createDatabase(databaseConfig),
    },
    {
      provide: UnitOfWork,
      inject: [DATABASE],
      useFactory: (database: Database) => new UnitOfWork(database),
    },
    { provide: EVENT_BUS, useFactory: () => createMessaging(messagingConfig) },
  ],
  exports: [DATABASE, EVENT_BUS, UnitOfWork],
})
export class InfraModule {}
