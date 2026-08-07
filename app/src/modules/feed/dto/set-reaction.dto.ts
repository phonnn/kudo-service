import { IsEnum } from 'class-validator';
import { ReactionType } from './reaction-type.enum';

export class SetReactionDto {
  @IsEnum(ReactionType) type!: ReactionType;
}
