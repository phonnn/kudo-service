import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { CommentService } from '../services/comment.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { ListCommentsQueryDto } from '../dto/list-comments-query.dto';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';

const DEFAULT_COMMENT_LIMIT = 20;

@UseGuards(AuthGuard)
@Controller('kudos/:postId/comments')
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Get()
  list(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.comments.listComments(
      postId,
      query.limit ?? DEFAULT_COMMENT_LIMIT,
    );
  }

  @Post()
  async create(
    @Param('postId', ParseUUIDPipe) postId: string,
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
