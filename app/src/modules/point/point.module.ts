import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { ConfigModule } from '../../config';
import { OutboxModule } from '../outbox';
import { BalanceController } from './controllers/balance.controller';
import { KudoReservedListener } from './listeners/kudo-reserved.listener';
import { KudoDebitedListener } from './listeners/kudo-debited.listener';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { PointLedgerService } from './services/point-ledger.service';
import { PointTransferService } from './services/point-transfer.service';
import { ReceiverBalanceService } from './services/receiver-balance.service';
import { PointLedgerRepository } from './repositories/point-ledger.repository';
import { PointTransferRepository } from './repositories/point-transfer.repository';
import { ReceiverBalanceRepository } from './repositories/receiver-balance.repository';
import { SenderBalanceRepository } from './repositories/sender-balance.repository';
@Module({
  imports: [InfraModule, ConfigModule, OutboxModule],
  controllers: [BalanceController],
  providers: [
    SenderBalanceRepository,
    PointTransferRepository,
    PointLedgerRepository,
    ReceiverBalanceRepository,
    PointTransferService,
    ReceiverBalanceService,
    PointLedgerService,
    KudoReservedListener,
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
