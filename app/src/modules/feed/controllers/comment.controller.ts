import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { CommentService } from '../services/comment.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';

@UseGuards(AuthGuard)
@Controller('kudos/:postId/comments')
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Post()
  async create(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    try {
      return await this.comments.addComment({
        postId,
        authorId: principal.subject,
        body: dto.body,
      });
    } catch (error) {
      if (error instanceof FeedPostNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
