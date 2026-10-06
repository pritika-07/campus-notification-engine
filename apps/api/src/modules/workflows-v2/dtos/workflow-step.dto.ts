import { IsString, IsEnum, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ChannelTypeEnum, DigestLevelEnum } from '@campus/shared';

export class WorkflowStepTemplateDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class WorkflowStepDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsOptional()
  @IsString()
  _templateId?: string;

  @IsString()
  name: string;

  @IsEnum(ChannelTypeEnum)
  type: ChannelTypeEnum;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowStepTemplateDto)
  template?: WorkflowStepTemplateDto;

  @IsOptional()
  @IsObject()
  controls?: Record<string, any>;

  @IsOptional()
  @IsString()
  digestKey?: string;

  @IsOptional()
  delayAmount?: number;

  @IsOptional()
  @IsString()
  delayUnit?: 'seconds' | 'minutes' | 'hours' | 'days';

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  critical?: boolean;
}

export class WorkflowTriggerDto {
  @IsString()
  identifier: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ControlValuesDto {
  _stepId: string;
  level: DigestLevelEnum;
  providerId?: string;
  controls: Record<string, any>;
}
