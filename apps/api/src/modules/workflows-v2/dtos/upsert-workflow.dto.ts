import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowStepDto, WorkflowTriggerDto, ControlValuesDto } from './workflow-step.dto';

export class UpsertWorkflowDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  draft?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTriggerDto)
  triggers: WorkflowTriggerDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ControlValuesDto)
  controlValues?: ControlValuesDto[];

  @IsOptional()
  @IsString()
  _parentId?: string;
}
