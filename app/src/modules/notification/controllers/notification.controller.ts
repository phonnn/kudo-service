import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentPrincipal, type Principal } from '@kudo/security';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';
import {
  NotificationService,
  type NotificationPage,
} from '../services/notification.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<NotificationPage> {
    try {
      return await this.notifications.listForUser(
        principal.subject,
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

  @Post(':id/read')
  @HttpCode(204)
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    const wasRead = await this.notifications.markRead(id, principal.subject);
    if (!wasRead) {
      throw new NotFoundException('Notification not found');
    }
  }
}
