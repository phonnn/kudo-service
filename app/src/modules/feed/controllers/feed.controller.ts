import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { FeedPostService } from '../services/feed-post.service';
import { SendKudoDto } from '../dto/send-kudo.dto';

@Controller('kudos')
export class FeedController {
  constructor(private readonly feedPosts: FeedPostService) {}

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
    return this.feedPosts.sendKudo({
      senderId,
      idempotencyKey,
      ...dto,
    });
  }
}
