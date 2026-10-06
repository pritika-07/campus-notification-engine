import { IsString, IsEnum, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ChannelTypeEnum } from '@campus/shared';

export class UpsertIntegrationDto {
  @IsString()
  providerId: string;

  @IsEnum(ChannelTypeEnum)
  channel: ChannelTypeEnum;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsObject()
  credentials: Record<string, any>;
}

export class AcademicCalendarEntryDto {
  @IsString()
  @IsEnum(require('@campus/shared').AcademicPeriodEnum)
  period: any;

  startDate: string | Date;
  endDate: string | Date;
}
