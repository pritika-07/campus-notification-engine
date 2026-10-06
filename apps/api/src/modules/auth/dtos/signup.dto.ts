import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

export class SignupDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  organizationName: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}
