import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InfraModule } from '../infra/infra.module';
import { OutboxRelayWorker } from './outbox-relay.worker';
import { BudgetResetWorker } from './budget-reset.worker';
import { OutboxModule } from '../modules/outbox';
import { PointModule } from '../modules/point/point.module';

@Module({
  imports: [ScheduleModule.forRoot(), InfraModule, OutboxModule, PointModule],
  providers: [OutboxRelayWorker, BudgetResetWorker],
})
export class WorkersModule {}
