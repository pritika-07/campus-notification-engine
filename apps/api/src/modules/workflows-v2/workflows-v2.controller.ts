import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UpsertWorkflowUseCase } from './usecases/upsert-workflow.usecase';
import { SyncWorkflowUseCase } from './usecases/sync-workflow.usecase';
import { NotificationTemplateRepository } from './notification-template.repository';
import { ControlValuesRepository } from './control-values.repository';
import { UpsertWorkflowDto } from './dtos/upsert-workflow.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsEnum, ErrorCode } from '@campus/shared';

@Controller({ path: 'workflows', version: '2' })
@UseGuards(AuthGuard('jwt'))
export class WorkflowsV2Controller {
  constructor(
    private upsertUseCase: UpsertWorkflowUseCase,
    private syncUseCase: SyncWorkflowUseCase,
    private templateRepo: NotificationTemplateRepository,
    private controlValuesRepo: ControlValuesRepository,
  ) {}

  @Get()
  @RequirePermissions(PermissionsEnum.WORKFLOW_READ)
  async list(@Request() req: any, @Query() query: any) {
    const _environmentId = req.user._environmentId;
    const _organizationId = req.user._organizationId;
    const workflows = await this.templateRepo.find({
      _environmentId,
      _organizationId,
    });
    return { data: workflows, total: workflows.length };
  }

  @Get(':id')
  @RequirePermissions(PermissionsEnum.WORKFLOW_READ)
  async getById(@Param('id') id: string, @Request() req: any) {
    const workflow = await this.templateRepo.findById(id);
    if (!workflow) {
      throw new NotFoundException({
        error: ErrorCode.WORKFLOW_NOT_FOUND,
        message: 'Workflow not found',
      });
    }
    const controlValues = await this.controlValuesRepo.find({
      _workflowId: workflow._id,
      _environmentId: workflow._environmentId,
    });
    return { workflow, controlValues };
  }

  @Post()
  @RequirePermissions(PermissionsEnum.WORKFLOW_WRITE)
  async create(@Body() dto: UpsertWorkflowDto, @Request() req: any) {
    return this.upsertUseCase.execute(dto, {
      _organizationId: req.user._organizationId,
      _environmentId: req.user._environmentId,
      _userId: req.user._id,
    });
  }

  @Put(':id')
  @RequirePermissions(PermissionsEnum.WORKFLOW_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpsertWorkflowDto,
    @Request() req: any,
  ) {
    return this.upsertUseCase.execute(dto, {
      _organizationId: req.user._organizationId,
      _environmentId: req.user._environmentId,
      _userId: req.user._id,
      existingId: id,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionsEnum.WORKFLOW_WRITE)
  async patch(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertWorkflowDto>,
    @Request() req: any,
  ) {
    const existing = await this.templateRepo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: ErrorCode.WORKFLOW_NOT_FOUND,
        message: 'Workflow not found',
      });
    }
    const merged: UpsertWorkflowDto = {
      name: dto.name ?? existing.name,
      steps: dto.steps ?? existing.steps as any,
      triggers: dto.triggers ?? existing.triggers as any,
      description: dto.description ?? existing.description,
      active: dto.active ?? existing.active,
      draft: dto.draft ?? existing.draft,
      status: dto.status ?? existing.status,
      origin: dto.origin ?? existing.origin,
      tags: dto.tags ?? existing.tags,
      controlValues: dto.controlValues,
      _parentId: dto._parentId ?? existing._parentId?.toString(),
    };
    return this.upsertUseCase.execute(merged, {
      _organizationId: req.user._organizationId,
      _environmentId: req.user._environmentId,
      _userId: req.user._id,
      existingId: id,
    });
  }

  @Delete(':id')
  @RequirePermissions(PermissionsEnum.WORKFLOW_WRITE)
  async remove(@Param('id') id: string, @Request() req: any) {
    const workflow = await this.templateRepo.deleteById(id);
    if (!workflow) {
      throw new NotFoundException({
        error: ErrorCode.WORKFLOW_NOT_FOUND,
        message: 'Workflow not found',
      });
    }
    return { success: true };
  }

  @Put(':id/sync')
  @RequirePermissions(PermissionsEnum.WORKFLOW_WRITE)
  async sync(@Param('id') id: string, @Request() req: any) {
    return this.syncUseCase.execute(id, {
      _organizationId: req.user._organizationId,
      _userId: req.user._id,
    });
  }
}
