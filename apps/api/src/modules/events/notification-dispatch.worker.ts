import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Types as MongooseTypes } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationTemplateRepository } from '../workflows-v2/notification-template.repository';
import { ControlValuesRepository } from '../workflows-v2/control-values.repository';
import { SubscriberRepository } from '../subscribers/subscriber.repository';
import { IntegrationRepository } from '../integrations/integration.repository';
import { MessageRepository } from '../messages/message.repository';
import { JobRepository } from '../jobs/job.repository';
import { ExecutionDetailRepository } from '../execution-details/execution-detail.repository';
import {
  ProviderRegistryService,
  ProviderDispatchInput,
} from './providers/provider-registry.service';
import {
  NotificationJobPayload,
  NOTIFICATION_QUEUE,
} from './trigger.service';
import {
  ChannelTypeEnum,
  ExecutionStatusEnum,
  MessageStatusEnum,
  DigestLevelEnum,
} from '@campus/shared';
import { Message } from '../messages/message.schema';

@Processor(NOTIFICATION_QUEUE)
@Injectable()
export class NotificationDispatchWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatchWorker.name);

  constructor(
    private templateRepo: NotificationTemplateRepository,
    private controlValuesRepo: ControlValuesRepository,
    private subscriberRepo: SubscriberRepository,
    private integrationRepo: IntegrationRepository,
    private messageRepo: MessageRepository,
    private jobRepo: JobRepository,
    private executionDetailRepo: ExecutionDetailRepository,
    private providerRegistry: ProviderRegistryService,
    private eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>) {
    if (process.env.__CAMPUS_INMEMORY_REDIS === '1') return { skipped: true, reason: 'inmemory_redis_mode' };
    const data = job.data;
    this.logger.log(
      `Processing notification job: notification=${data.notificationId} channel=${data.channel} step=${data.stepIndex}`,
    );

    const workflow = await this.templateRepo.findById(data.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${data.workflowId} not found`);
    }
    const step = workflow.steps[data.stepIndex];
    if (!step) {
      throw new Error(`Step index ${data.stepIndex} not found in workflow`);
    }

    const subscriber = await this.subscriberRepo.findById(data.subscriberId);
    if (!subscriber) {
      throw new Error(`Subscriber ${data.subscriberId} not found`);
    }

    const channelPref = (subscriber.channels as any)?.[data.channel];
    if (channelPref && channelPref.enabled === false) {
      await this.executionDetailRepo.create({
        _jobId: new MongooseTypes.ObjectId(data.notificationId),
        _notificationId: new MongooseTypes.ObjectId(data.notificationId),
        status: ExecutionStatusEnum.SUCCESS,
        isTest: false,
        detail: { skipped: true, reason: 'channel_muted', channel: data.channel },
      });
      return { skipped: true, reason: 'channel_muted' };
    }

    const stepControls = await this.controlValuesRepo.find({
      _workflowId: workflow._id,
      _stepId: step._id,
      _environmentId: data.environmentId,
    });
    const mergedControls: Record<string, any> = {};
    for (const cv of stepControls) {
      if (cv.level === DigestLevelEnum.STEP_CONTROLS) {
        Object.assign(mergedControls, cv.controls || {});
      }
    }

    const rendered = this.renderContent(step, {
      ...mergedControls,
      ...(data.payload || {}),
      subscriber: {
        subscriberId: subscriber.subscriberId,
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        email: subscriber.email,
        phone: subscriber.phone,
        data: subscriber.data,
      },
    });

    let providerId = step.providerId;
    if (!providerId) {
      const integration = await this.integrationRepo.findActiveByChannel(
        data.environmentId,
        data.channel,
      );
      providerId = integration?.providerId;
    }

    const messageData: Partial<Message> = {
      channel: data.channel,
      content: rendered.content,
      subject: rendered.subject,
      seen: false,
      read: false,
      archived: false,
      status: MessageStatusEnum.SENT,
      transactionId: data.transactionId,
      _templateId: workflow._id as MongooseTypes.ObjectId,
      _notificationId: new MongooseTypes.ObjectId(data.notificationId),
      _subscriberId: subscriber._id as MongooseTypes.ObjectId,
      _environmentId: new MongooseTypes.ObjectId(data.environmentId),
      _organizationId: new MongooseTypes.ObjectId(data.organizationId),
    };

    if (data.channel === ChannelTypeEnum.IN_APP) {
      const msg = await this.messageRepo.insertIfNotExists(messageData);
      if (msg) {
        this.eventEmitter.emit('message.saved', { message: msg });
      }
      await this.jobRepo.updateById(data.notificationId, {
        status: ExecutionStatusEnum.SUCCESS,
      });
      await this.executionDetailRepo.create({
        _notificationId: new MongooseTypes.ObjectId(data.notificationId),
        status: ExecutionStatusEnum.SUCCESS,
        isTest: false,
        detail: { channel: data.channel, provider: 'in_app_direct' },
      });
      return { success: true, channel: data.channel, provider: 'in_app_direct' };
    }

    const provider = this.providerRegistry.find(data.channel, providerId);
    if (!provider) {
      await this.executionDetailRepo.create({
        _notificationId: new MongooseTypes.ObjectId(data.notificationId),
        status: ExecutionStatusEnum.FAILED,
        isTest: false,
        detail: { error: 'no_provider_found', channel: data.channel, providerId },
      });
      throw new Error(`No provider found for channel=${data.channel} providerId=${providerId}`);
    }

    const dispatchInput: ProviderDispatchInput = {
      channel: data.channel,
      providerId: provider.id,
      subscriber,
      content: rendered.content,
      subject: rendered.subject,
      template: step.template,
      message: messageData,
    };
    const result = await provider.dispatch(dispatchInput);

    const finalMessage: Partial<Message> = {
      ...messageData,
      status: result.success ? MessageStatusEnum.SENT : MessageStatusEnum.ERROR,
    };
    const persisted = await this.messageRepo.insertIfNotExists(finalMessage);
    const currentChannel = data.channel as unknown as ChannelTypeEnum;
    if (persisted && result.success && currentChannel === ChannelTypeEnum.IN_APP) {
      this.eventEmitter.emit('message.saved', { message: persisted });
    }

    await this.jobRepo.updateById(data.notificationId, {
      status: result.success ? ExecutionStatusEnum.SUCCESS : ExecutionStatusEnum.FAILED,
    });

    await this.executionDetailRepo.create({
      _notificationId: new MongooseTypes.ObjectId(data.notificationId),
      status: result.success ? ExecutionStatusEnum.SUCCESS : ExecutionStatusEnum.FAILED,
      isTest: false,
      detail: {
        channel: data.channel,
        provider: provider.id,
        providerResponse: result.providerResponse,
        error: result.error,
      },
    });

    if (!result.success) {
      throw new Error(`Provider dispatch failed: ${result.error || 'unknown'}`);
    }

    return { success: true, channel: data.channel, provider: provider.id };
  }

  private renderContent(step: any, vars: Record<string, any>): { content: string; subject?: string } {
    const subst = (input: string | undefined): string => {
      if (!input) return '';
      return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path) => {
        const parts = path.split('.');
        let cur: any = vars;
        for (const p of parts) {
          if (cur && typeof cur === 'object' && p in cur) {
            cur = cur[p];
          } else {
            return '';
          }
        }
        return cur == null ? '' : String(cur);
      });
    };

    const tpl = step.template || {};
    if (step.type === ChannelTypeEnum.EMAIL) {
      return {
        subject: subst(tpl.subject),
        content: subst(tpl.html) || subst(tpl.body),
      };
    }
    if (step.type === ChannelTypeEnum.SMS || step.type === ChannelTypeEnum.PUSH) {
      return { content: subst(tpl.body) || subst(tpl.title) || '' };
    }
    if (step.type === ChannelTypeEnum.IN_APP || step.type === ChannelTypeEnum.CHAT) {
      return {
        subject: subst(tpl.title),
        content: subst(tpl.body) || subst(tpl.html) || '',
      };
    }
    return { content: subst(tpl.body) || '' };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job?.id} failed: ${err?.message}`,
      err?.stack,
    );
  }
}
