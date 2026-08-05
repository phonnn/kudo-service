import { Module } from '@nestjs/common';
import { InfraModule } from '../infra/infra.module';
import { OutboxRelayWorker } from './outbox-relay.worker';
import { OutboxModule } from '../modules/outbox';

@Module({
  imports: [InfraModule, OutboxModule],
  providers: [OutboxRelayWorker],
})
export class WorkersModule {}
