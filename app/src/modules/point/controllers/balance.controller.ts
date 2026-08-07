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

  // Both reads are the cheap, unlocked, eventually-consistent side (§7/§8)
  // — exactly what a display read should be; spend-time checks
  // (reserve()/lockForUpdate()) are separate, authoritative paths this
  // never touches. A user with no row yet (not provisioned — see the
  // known gap in provision() never being called from user creation) reads
  // as zero rather than erroring; that's a reasonable display default
  // either way once provisioning is wired up.
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
