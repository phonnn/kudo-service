import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UserService, type UserPage } from '../services/user.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  async list(
    @Query() query: ListUsersQueryDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<UserPage> {
    try {
      return await this.users.listTeammates(
        principal.subject,
        query.search,
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
