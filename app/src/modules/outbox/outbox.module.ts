import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { OutboxRepository } from './repositories/outbox.repository';

@Module({
  imports: [InfraModule],
  providers: [OutboxRepository],
  exports: [OutboxRepository],
})
export class OutboxModule {}
