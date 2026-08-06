import { Global, Module } from '@nestjs/common';
import { createMessaging } from '@kudo/messaging';
import { createDatabase, type Database, UnitOfWork } from '@kudo/database';
import { createStorage } from '@kudo/storage';
import { DATABASE, EVENT_BUS, STORAGE } from './token.constant';
import {
  ConfigModule,
  DatabaseConfigService,
  MessagingConfigService,
  StorageConfigService,
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
    {
      provide: STORAGE,
      inject: [StorageConfigService],
      useFactory: (storageConfigService: StorageConfigService) =>
        createStorage(storageConfigService.getAll()),
    },
  ],
  exports: [DATABASE, EVENT_BUS, STORAGE, UnitOfWork],
})
export class InfraModule {}
