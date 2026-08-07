import { Global, Module } from '@nestjs/common';
import { createMessaging } from '@kudo/messaging';
import { createDatabase, type Database, UnitOfWork } from '@kudo/database';
import {
  createAuthProvider,
  AUTH_PROVIDER,
  StreamTicketStore,
} from '@kudo/security';
import { createStorage } from '@kudo/storage';
import { createRealtimePush } from '@kudo/realtime';
import { DATABASE, EVENT_BUS, STORAGE, REALTIME_PUSH } from './token.constant';
import {
  ConfigModule,
  DatabaseConfigService,
  MessagingConfigService,
  RealtimeConfigService,
  SecurityConfigService,
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
    {
      provide: AUTH_PROVIDER,
      inject: [SecurityConfigService],
      useFactory: (securityConfigService: SecurityConfigService) =>
        createAuthProvider(securityConfigService.getAll()),
    },
    {
      provide: REALTIME_PUSH,
      inject: [RealtimeConfigService],
      useFactory: (realtimeConfigService: RealtimeConfigService) =>
        createRealtimePush(realtimeConfigService.getAll()),
    },
    StreamTicketStore,
  ],
  exports: [
    DATABASE,
    EVENT_BUS,
    STORAGE,
    AUTH_PROVIDER,
    REALTIME_PUSH,
    StreamTicketStore,
    UnitOfWork,
  ],
})
export class InfraModule {}
