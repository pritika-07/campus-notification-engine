import { IsString, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SubscriberRefDto {
  @IsString()
  subscriberId: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class TriggerEventDto {
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => SubscriberRefDto)
  subscriber: SubscriberRefDto;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @IsOptional()
  @IsObject()
  overrides?: Record<string, any>;
}
