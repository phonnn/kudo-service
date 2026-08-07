import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { ReceiverBalanceRepository } from '../repositories/receiver-balance.repository';
import { SenderBalanceRepository } from '../repositories/sender-balance.repository';

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
}
