import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Tag } from './tag.enum';

// the object_key/domain a POST /media/presign upload already resolved to
// (§4 Phase 0) — never a fresh upload, so no contentType/kind here.
export class SendKudoMediaDto {
  @IsString() @Length(1, 500) objectKey!: string;
  @IsString() @Length(1, 500) domain!: string;
}

export class SendKudoDto {
  @IsUUID() recipientId!: string;
  @IsInt() @Min(10) @Max(50) points!: number;
  @IsEnum(Tag) tag!: Tag;
  @IsString() @Length(1, 2000) description!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => SendKudoMediaDto)
  media?: SendKudoMediaDto;
}
