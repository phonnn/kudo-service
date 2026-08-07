import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { ListPointHistoryQueryDto } from '../dto/list-point-history-query.dto';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { ReceiverBalanceRepository } from '../repositories/receiver-balance.repository';
import { SenderBalanceRepository } from '../repositories/sender-balance.repository';
import {
  PointLedgerService,
  type PointHistoryPage,
} from '../services/point-ledger.service';

export interface MyBalance {
  givingRemaining: number;
  earnedPoints: number;
}

@UseGuards(AuthGuard)
@Controller('balance')
export class BalanceController {
  constructor(
    private readonly senderBalances: SenderBalanceRepository,
    private readonly receiverBalances: ReceiverBalanceRepository,
    private readonly pointLedger: PointLedgerService,
  ) {}

  @Get()
  async getMyBalance(
    @CurrentPrincipal() principal: Principal,
  ): Promise<MyBalance> {
    const [givingRemaining, earnedPoints] = await Promise.all([
      this.senderBalances.getRemaining(principal.subject),
      this.receiverBalances.getEarnedPoints(principal.subject),
    ]);

    return {
      givingRemaining: givingRemaining ?? 0,
      earnedPoints: earnedPoints ?? 0,
    };
  }

  @Get('history')
  async getMyHistory(
    @Query() query: ListPointHistoryQueryDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<PointHistoryPage> {
    try {
      return await this.pointLedger.listHistory(
        principal.subject,
        query.limit,
        query.cursor,
      );
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
