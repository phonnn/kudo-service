import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
export enum CoreValue {
  TEAMWORK = 'teamwork',
  OWNERSHIP = 'ownership',
  INNOVATION = 'innovation',
  CUSTOMER_FOCUS = 'customer_focus',
}
export class SendKudoDto {
  @IsUUID() recipientId!: string;
  @IsInt() @Min(10) @Max(50) points!: number;
  @IsEnum(CoreValue) coreValue!: CoreValue;
  @IsString() @Length(1, 2000) description!: string;
}
