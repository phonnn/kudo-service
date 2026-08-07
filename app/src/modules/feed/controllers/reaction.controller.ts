import {
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { ReactionService } from '../services/reaction.service';
import { SetReactionDto } from '../dto/set-reaction.dto';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';

@UseGuards(AuthGuard)
@Controller('kudos/:postId/reactions')
export class ReactionController {
  constructor(private readonly reactions: ReactionService) {}

  @Post()
  @HttpCode(204)
  async set(
    @Param('postId') postId: string,
    @Body() dto: SetReactionDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    try {
      await this.reactions.setReaction(postId, principal.subject, dto.type);
    } catch (error) {
      if (error instanceof FeedPostNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Delete()
  @HttpCode(204)
  remove(
    @Param('postId') postId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.reactions.removeReaction(postId, principal.subject);
  }
}
