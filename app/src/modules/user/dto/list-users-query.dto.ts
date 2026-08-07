import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional() @IsString() @Length(1, 200) search?: string;

  @IsOptional() @IsString() cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
