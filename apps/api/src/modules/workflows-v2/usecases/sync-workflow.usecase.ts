import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession, Types as MongooseTypes } from 'mongoose';
import { NotificationTemplateRepository } from '../notification-template.repository';
import { ControlValuesRepository } from '../control-values.repository';
import { EnvironmentRepository } from '../../environments/environment.repository';
import { EnvironmentTypeEnum, ErrorCode } from '@campus/shared';

@Injectable()
export class SyncWorkflowUseCase {
  constructor(
    private templateRepo: NotificationTemplateRepository,
    private controlValuesRepo: ControlValuesRepository,
    private envRepo: EnvironmentRepository,
    @InjectConnection() private connection: Connection,
  ) {}

  async execute(
    workflowId: string,
    context: { _organizationId: string; _userId?: string },
  ) {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const source = await this.templateRepo.findById(workflowId, session);
        if (!source) {
          throw new NotFoundException({
            error: ErrorCode.WORKFLOW_NOT_FOUND,
            message: 'Workflow not found',
          });
        }

        const sourceEnv = await this.envRepo.findById(
          (source._environmentId as MongooseTypes.ObjectId).toString(),
          session,
        );
        if (!sourceEnv) {
          throw new BadRequestException({
            error: ErrorCode.INTERNAL_ERROR,
            message: 'Source environment not found',
          });
        }

        if (sourceEnv.type !== EnvironmentTypeEnum.DEV) {
          throw new BadRequestException({
            error: ErrorCode.CROSS_ORG_SYNC,
            message: 'Only DEV workflows can be synced',
          });
        }

        if (
          sourceEnv._organizationId.toString() !== context._organizationId
        ) {
          throw new BadRequestException({
            error: ErrorCode.CROSS_ORG_SYNC,
            message: 'Cannot sync workflow across organizations',
          });
        }

        const targetEnv = await this.envRepo.findOne(
          {
            _organizationId: sourceEnv._organizationId,
            type: EnvironmentTypeEnum.PROD,
          },
          session,
        );
        if (!targetEnv) {
          throw new BadRequestException({
            error: ErrorCode.INTERNAL_ERROR,
            message: 'Target PROD environment not found',
          });
        }

        const orgId = sourceEnv._organizationId;
        if (orgId.toString() !== context._organizationId) {
          throw new BadRequestException({
            error: ErrorCode.CROSS_ORG_SYNC,
            message: 'Cannot sync workflow across organizations',
          });
        }

        let target = await this.templateRepo.findOne(
          {
            _organizationId: orgId,
            _environmentId: targetEnv._id,
            _parentId: source._id,
          },
          session,
        );

        const syncedSteps = source.steps.map((s) => ({ ...s }));
        const data = {
          name: source.name,
          description: source.description,
          active: source.active,
          draft: false,
          status: source.status,
          origin: 'sync',
          steps: syncedSteps,
          triggers: source.triggers.map((t) => ({ ...t })),
          tags: source.tags,
          _environmentId: targetEnv._id,
          _organizationId: orgId,
          _creatorId: context._userId
            ? new MongooseTypes.ObjectId(context._userId)
            : source._creatorId,
          _parentId: source._id,
        };

        if (target) {
          target = await this.templateRepo.updateById(
            target._id.toString(),
            { $set: data } as any,
            session,
          );
        } else {
          target = await this.templateRepo.create(data, session);
        }

        const sourceCVs = await this.controlValuesRepo.find(
          {
            _workflowId: source._id,
            _environmentId: source._environmentId,
          },
          session,
        );
        if (sourceCVs.length > 0 && target) {
          await this.controlValuesRepo.deleteMany(
            {
              _workflowId: target._id,
              _environmentId: targetEnv._id,
            },
            session,
          );
          const bulkOps = sourceCVs.map((cv) => ({
            updateOne: {
              filter: {
                _workflowId: target!._id,
                _stepId: cv._stepId,
                _environmentId: targetEnv._id,
                level: cv.level,
              },
              update: {
                $set: {
                  _workflowId: target!._id,
                  _stepId: cv._stepId,
                  _environmentId: targetEnv._id,
                  _organizationId: orgId,
                  level: cv.level,
                  providerId: cv.providerId,
                  controls: cv.controls,
                },
              },
              upsert: true,
            },
          }));
          await this.controlValuesRepo.bulkWrite(bulkOps, session);
        }

        return target;
      });
    } finally {
      await session.endSession();
    }
  }
}
