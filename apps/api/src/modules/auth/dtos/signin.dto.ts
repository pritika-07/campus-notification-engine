import { IsString, IsEmail, MinLength } from 'class-validator';

export class SigninDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
