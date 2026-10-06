import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChannelPreferences } from '@campus/shared';

class ChannelPrefDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class ChannelsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPrefDto)
  email?: ChannelPrefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPrefDto)
  sms?: ChannelPrefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPrefDto)
  push?: ChannelPrefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPrefDto)
  in_app?: ChannelPrefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPrefDto)
  chat?: ChannelPrefDto;
}

export class UpsertSubscriberDto {
  @IsString()
  subscriberId: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelsDto)
  channels?: ChannelsDto;
}
