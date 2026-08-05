import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { PointTransferService } from './services/point-transfer.service';
import { SendKudoDto } from './dto/send-kudo.dto';
@Controller('kudos')
export class PointController {
  constructor(private readonly pointTransferService: PointTransferService) {}
  @Post()
  send(
    @Body() dto: SendKudoDto,
    @Headers('x-user-id') senderId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!senderId)
      throw new BadRequestException('x-user-id header is required');
    if (!idempotencyKey)
      throw new BadRequestException('idempotency-key header is required');
    return this.pointTransferService.sendKudo({
      senderId,
      idempotencyKey,
      ...dto,
    });
  }
}
