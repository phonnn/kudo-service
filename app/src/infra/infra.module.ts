import { Global, Module } from '@nestjs/common';
import { createMessaging } from '@kudo/messaging';
import { createDatabase, type Database, UnitOfWork } from '@kudo/database';
import { DATABASE, EVENT_BUS } from './token.constant';
import {
  ConfigModule,
  DatabaseConfigService,
  MessagingConfigService,
} from '../config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE,
      inject: [DatabaseConfigService],
      useFactory: (databaseConfigService: DatabaseConfigService) =>
        createDatabase(databaseConfigService.getAll()),
    },
    {
      provide: UnitOfWork,
      inject: [DATABASE],
      useFactory: (database: Database) => new UnitOfWork(database),
    },
    {
      provide: EVENT_BUS,
      inject: [MessagingConfigService],
      useFactory: (messagingConfigService: MessagingConfigService) =>
        createMessaging(messagingConfigService.getAll()),
    },
  ],
  exports: [DATABASE, EVENT_BUS, UnitOfWork],
})
export class InfraModule {}
