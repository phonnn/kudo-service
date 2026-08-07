import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { FeedPostService, type FeedPage } from '../services/feed-post.service';
import { SendKudoDto } from '../dto/send-kudo.dto';
import { ListFeedQueryDto } from '../dto/list-feed-query.dto';

@Controller('kudos')
export class FeedController {
  constructor(private readonly feedPosts: FeedPostService) {}

  @UseGuards(AuthGuard)
  @Post()
  send(
    @Body() dto: SendKudoDto,
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('idempotency-key header is required');
    return this.feedPosts.sendKudo({
      senderId: principal.subject,
      idempotencyKey,
      ...dto,
    });
  }

  @UseGuards(AuthGuard)
  @Get()
  list(
    @Query() query: ListFeedQueryDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<FeedPage> {
    return this.feedPosts.listFeed(
      principal.subject,
      query.limit,
      query.cursor,
    );
  }
}
