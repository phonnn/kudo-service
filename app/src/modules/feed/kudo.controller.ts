import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { SendKudoService } from './services/send-kudo.service';
import { SendKudoDto } from './dto/send-kudo.dto';

@Controller('kudos')
export class KudoController {
  constructor(private readonly sendKudoService: SendKudoService) {}

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
    return this.sendKudoService.sendKudo({
      senderId,
      idempotencyKey,
      ...dto,
    });
  }
}
