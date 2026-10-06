import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession, Types as MongooseTypes } from 'mongoose';
import * as prettier from 'prettier';
import { NotificationTemplateRepository } from '../notification-template.repository';
import { ControlValuesRepository } from '../../workflows-v2/control-values.repository';
import { UpsertWorkflowDto } from '../dtos/upsert-workflow.dto';
import {
  NotificationTemplate,
  WorkflowStep,
  WorkflowTrigger,
} from '../notification-template.schema';
import { ControlValues } from '../control-values.schema';
import { generateStepId } from '../../../common/helpers/slugify.helper';
import { ErrorCode, ChannelTypeEnum, DigestLevelEnum } from '@campus/shared';

@Injectable()
export class UpsertWorkflowUseCase {
  constructor(
    private templateRepo: NotificationTemplateRepository,
    private controlValuesRepo: ControlValuesRepository,
    @InjectConnection() private connection: Connection,
  ) {}

  async execute(
    dto: UpsertWorkflowDto,
    context: {
      _organizationId: string;
      _environmentId: string;
      _userId?: string;
      existingId?: string;
    },
  ) {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const existing = context.existingId
          ? await this.templateRepo.findById(context.existingId, session)
          : null;

        if (context.existingId && !existing) {
          throw new NotFoundException({
            error: ErrorCode.WORKFLOW_NOT_FOUND,
            message: 'Workflow not found',
          });
        }

        const existingStepIds = new Set<string>();
        if (existing && context.existingId) {
          for (const s of existing.steps) {
            if (s._id) existingStepIds.add(s._id);
          }
          for (const step of dto.steps) {
            if (step._id && !existingStepIds.has(step._id)) {
              throw new BadRequestException({
                error: ErrorCode.STEP_NOT_IN_WORKFLOW,
                message: `Step ${step._id} does not belong to this workflow`,
              });
            }
          }
        }

        const finalSteps: WorkflowStep[] = [];
        const usedIds = new Set<string>();
        for (const step of dto.steps) {
          let id = step._id;
          if (!id) {
            let attempt = 0;
            let candidate: string;
            while (true) {
              candidate = generateStepId(step.name, attempt);
              if (!usedIds.has(candidate)) break;
              attempt++;
              if (attempt >= 5) {
                throw new BadRequestException({
                  error: ErrorCode.STEP_ID_COLLISION,
                  message: 'Could not generate unique step ID',
                });
              }
            }
            id = candidate;
          }
          usedIds.add(id);

          if (step.type === ChannelTypeEnum.EMAIL && step.template?.html) {
            try {
              await prettier.format(step.template.html, {
                parser: 'html',
              });
            } catch (e) {
              throw new BadRequestException({
                error: ErrorCode.MALFORMED_HTML,
                message: 'Email template HTML is malformed',
              });
            }
          }

          finalSteps.push({
            _id: id,
            _templateId: step._templateId,
            name: step.name,
            type: step.type,
            template: step.template,
            controls: step.controls,
            digestKey: step.digestKey,
            delayAmount: step.delayAmount,
            delayUnit: step.delayUnit,
            providerId: step.providerId,
            critical: step.critical,
          });
        }

        const triggers: WorkflowTrigger[] = dto.triggers.map((t) => ({
          identifier: t.identifier,
          label: t.label,
          description: t.description,
        }));

        const baseData: Partial<NotificationTemplate> = {
          name: dto.name,
          description: dto.description,
          active: dto.active ?? existing?.active ?? true,
          draft: dto.draft ?? existing?.draft ?? false,
          status: dto.status ?? existing?.status ?? 'draft',
          origin: dto.origin ?? existing?.origin ?? 'dashboard',
          steps: finalSteps,
          triggers,
          tags: dto.tags ?? existing?.tags ?? [],
          _environmentId: new MongooseTypes.ObjectId(context._environmentId),
          _organizationId: new MongooseTypes.ObjectId(context._organizationId),
          _creatorId: context._userId
            ? new MongooseTypes.ObjectId(context._userId)
            : existing?._creatorId,
          _parentId: dto._parentId
            ? new MongooseTypes.ObjectId(dto._parentId)
            : existing?._parentId,
        };

        let template;
        if (existing && context.existingId) {
          template = await this.templateRepo.updateById(
            context.existingId,
            { $set: baseData } as any,
            session,
          );
        } else {
          template = await this.templateRepo.create(baseData, session);
        }
        if (!template) {
          throw new BadRequestException({
            error: ErrorCode.TRANSACTION_FAILED,
            message: 'Failed to persist workflow',
          });
        }

        if (dto.controlValues && dto.controlValues.length > 0) {
          const workflowId = template._id as MongooseTypes.ObjectId;
          const bulkOps: Array<{
            updateOne: {
              filter: any;
              update: any;
              upsert?: boolean;
            };
          }> = [];
          for (const cv of dto.controlValues) {
            const stepExists = finalSteps.some((s) => s._id === cv._stepId);
            if (!stepExists) continue;
            const filter = {
              _workflowId: workflowId,
              _stepId: cv._stepId,
              _environmentId: new MongooseTypes.ObjectId(context._environmentId),
              level: cv.level || DigestLevelEnum.STEP_CONTROLS,
            };
            const update: Partial<ControlValues> = {
              _workflowId: workflowId,
              _stepId: cv._stepId,
              _environmentId: new MongooseTypes.ObjectId(context._environmentId),
              _organizationId: new MongooseTypes.ObjectId(context._organizationId),
              level: cv.level || DigestLevelEnum.STEP_CONTROLS,
              providerId: cv.providerId,
              controls: cv.controls || {},
            };
            bulkOps.push({
              updateOne: {
                filter,
                update: { $set: update },
                upsert: true,
              },
            });
          }
          if (bulkOps.length > 0) {
            await this.controlValuesRepo.bulkWrite(bulkOps, session);
          }
        }

        return template;
      });
    } finally {
      await session.endSession();
    }
  }
}
