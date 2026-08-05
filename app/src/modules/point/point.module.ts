import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { FeedModule } from '../feed';
import { OutboxModule } from '../outbox';
import { PointTransferService } from './services/point-transfer.service';
import { PointController } from './point.controller';
import { PointLedgerRepository } from './repositories/point-ledger.repository';
import { PointTransferRepository } from './repositories/point-transfer.repository';
import { SenderBalanceRepository } from './repositories/sender-balance.repository';
@Module({
  imports: [InfraModule, FeedModule, OutboxModule],
  controllers: [PointController],
  providers: [
    SenderBalanceRepository,
    PointTransferRepository,
    PointLedgerRepository,
    PointTransferService,
  ],
  exports: [
    SenderBalanceRepository,
    PointTransferRepository,
    PointLedgerRepository,
  ],
})
export class PointModule {}
