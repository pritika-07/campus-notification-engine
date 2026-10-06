import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { Types as MongooseTypes } from 'mongoose';
import { NotificationTemplateRepository } from '../workflows-v2/notification-template.repository';
import { SubscriberRepository } from '../subscribers/subscriber.repository';
import { NotificationRepository } from '../notifications/notification.repository';
import { JobRepository } from '../jobs/job.repository';
import { TriggerEventDto } from './dtos/trigger-event.dto';
import { ErrorCode, ChannelTypeEnum, ExecutionStatusEnum } from '@campus/shared';
import { DigestService } from '../digest/digest.service';

export const NOTIFICATION_QUEUE = 'notification-dispatch';

export interface NotificationJobPayload {
  notificationId: string;
  subscriberId: string;
  environmentId: string;
  organizationId: string;
  transactionId: string;
  workflowId: string;
  stepIndex: number;
  channel: ChannelTypeEnum;
  payload: Record<string, any>;
}

@Injectable()
export class TriggerService {
  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private queue: Queue,
    private templateRepo: NotificationTemplateRepository,
    private subscriberRepo: SubscriberRepository,
    private notificationRepo: NotificationRepository,
    private jobRepo: JobRepository,
    private digestService: DigestService,
  ) {}

  async trigger(
    dto: TriggerEventDto,
    context: { _environmentId: string; _organizationId: string },
  ) {
    const workflow = await this.templateRepo.findByTriggerIdentifier(
      context._environmentId,
      dto.name,
    );
    if (!workflow) {
      throw new NotFoundException({
        error: ErrorCode.WORKFLOW_NOT_FOUND,
        message: `No workflow found for trigger ${dto.name}`,
      });
    }

    let subscriber = await this.subscriberRepo.findBySubscriberId(
      dto.subscriber.subscriberId,
      context._environmentId,
    );
    if (!subscriber) {
      subscriber = await this.subscriberRepo.create({
        subscriberId: dto.subscriber.subscriberId,
        firstName: dto.subscriber.firstName,
        lastName: dto.subscriber.lastName,
        email: dto.subscriber.email,
        phone: dto.subscriber.phone,
        _environmentId: new MongooseTypes.ObjectId(context._environmentId),
        _organizationId: new MongooseTypes.ObjectId(context._organizationId),
      });
    }

    const transactionId = uuidv4();

    const notification = await this.notificationRepo.create({
      _templateId: workflow._id as MongooseTypes.ObjectId,
      _subscriberId: subscriber._id as MongooseTypes.ObjectId,
      _environmentId: new MongooseTypes.ObjectId(context._environmentId),
      transactionId,
      payload: dto.payload || {},
    });

    const jobs: Array<{
      jobId: MongooseTypes.ObjectId;
      bullJobId?: string | number | undefined;
      step: string;
      channel: ChannelTypeEnum;
      kind: 'dispatch' | 'digest';
      windowMinutes?: number;
    }> = [];

    let accumulatedDelayMs = 0;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      if (step.type === ChannelTypeEnum.DELAY) {
        accumulatedDelayMs += this.getStepDelayMs(step);
        continue;
      }

      if (step.type === ChannelTypeEnum.DIGEST) {
        const digestKey = step.digestKey || `default-${step._id || i}`;
        const res = await this.digestService.collect({
          subscriberId: subscriber._id.toString(),
          environmentId: context._environmentId,
          organizationId: context._organizationId,
          digestKey,
          workflowId: workflow._id.toString(),
          stepId: step._id || `step-${i}`,
          payload: dto.payload || {},
          critical: !!step.critical,
          transactionId,
        });
        const jobRec = await this.jobRepo.create({
          _notificationId: notification._id as MongooseTypes.ObjectId,
          _subscriberId: subscriber._id as MongooseTypes.ObjectId,
          _environmentId: new MongooseTypes.ObjectId(context._environmentId),
          status: ExecutionStatusEnum.QUEUED,
          type: ChannelTypeEnum.DIGEST,
        });
        jobs.push({
          jobId: jobRec._id,
          step: step.name || `digest-${i}`,
          channel: ChannelTypeEnum.DIGEST,
          kind: 'digest',
          windowMinutes: res.windowMinutes,
        });
        continue;
      }

      const job = await this.jobRepo.create({
        _notificationId: notification._id as MongooseTypes.ObjectId,
        _subscriberId: subscriber._id as MongooseTypes.ObjectId,
        _environmentId: new MongooseTypes.ObjectId(context._environmentId),
        status: ExecutionStatusEnum.QUEUED,
        type: step.type,
      });
      const payload: NotificationJobPayload = {
        notificationId: notification._id.toString(),
        subscriberId: subscriber._id.toString(),
        environmentId: context._environmentId,
        organizationId: context._organizationId,
        transactionId,
        workflowId: workflow._id.toString(),
        stepIndex: i,
        channel: step.type,
        payload: dto.payload || {},
      };
      const stepDelay = this.getStepDelayMs(step);
      const totalDelay = accumulatedDelayMs + stepDelay;
      const bullJob = await this.queue.add(
        `dispatch:${step.type}:${job._id}`,
        payload,
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
          delay: totalDelay,
        },
      );
      jobs.push({
        jobId: job._id,
        bullJobId: bullJob.id,
        step: step.name || `step-${i}`,
        channel: step.type,
        kind: 'dispatch',
      });
    }

    return {
      acknowledged: true,
      transactionId,
      notificationId: notification._id,
      jobs,
    };
  }

  private getStepDelayMs(step: any): number {
    if (step.type !== ChannelTypeEnum.DELAY || !step.delayAmount) return 0;
    const unit = step.delayUnit || 'minutes';
    const multipliers: Record<string, number> = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
    };
    return step.delayAmount * (multipliers[unit] || 60 * 1000);
  }
}
