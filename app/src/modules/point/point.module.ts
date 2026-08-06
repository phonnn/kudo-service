import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { FeedModule } from '../feed';
import { OutboxModule } from '../outbox';
import { KudoDebitedListener } from './listeners/kudo-debited.listener';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { PointTransferService } from './services/point-transfer.service';
import { ReceiverBalanceService } from './services/receiver-balance.service';
import { PointController } from './point.controller';
import { PointLedgerRepository } from './repositories/point-ledger.repository';
import { PointTransferRepository } from './repositories/point-transfer.repository';
import { ReceiverBalanceRepository } from './repositories/receiver-balance.repository';
import { SenderBalanceRepository } from './repositories/sender-balance.repository';
@Module({
  imports: [InfraModule, FeedModule, OutboxModule],
  controllers: [PointController],
  providers: [
    SenderBalanceRepository,
    PointTransferRepository,
    PointLedgerRepository,
    ReceiverBalanceRepository,
    PointTransferService,
    ReceiverBalanceService,
    KudoDebitedListener,
    KudoCreditedListener,
  ],
  exports: [
    SenderBalanceRepository,
    PointTransferRepository,
    PointLedgerRepository,
    ReceiverBalanceRepository,
    PointTransferService,
    ReceiverBalanceService,
  ],
})
export class PointModule {}
