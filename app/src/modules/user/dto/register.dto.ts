import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsString() @MinLength(8) password!: string;
}
