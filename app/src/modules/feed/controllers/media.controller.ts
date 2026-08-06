import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
} from '@nestjs/common';
import type { PresignedUpload, Storage } from '@kudo/storage';
import { STORAGE } from '../../../infra/token.constant';

export interface PresignMediaUploadDto {
  contentType: string;
}

@Controller('media')
export class MediaController {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  @Post('presign')
  presign(@Body() body: PresignMediaUploadDto): Promise<PresignedUpload> {
    if (!body.contentType?.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }
    return this.storage.presignUpload({ contentType: body.contentType });
  }
}
