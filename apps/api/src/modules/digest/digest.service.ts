import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { Types as MongooseTypes } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationTemplateRepository } from '../workflows-v2/notification-template.repository';
import { SubscriberRepository } from '../subscribers/subscriber.repository';
import { MessageRepository } from '../messages/message.repository';
import { ControlValuesRepository } from '../workflows-v2/control-values.repository';
import { DigestWindowService, DIGEST_QUEUE } from './digest-window.service';
import {
  ChannelTypeEnum,
  MessageStatusEnum,
  DigestLevelEnum,
} from '@campus/shared';

export interface DigestCollectInput {
  subscriberId: string;
  environmentId: string;
  organizationId: string;
  digestKey: string;
  workflowId: string;
  stepId: string;
  payload: Record<string, any>;
  critical?: boolean;
  transactionId: string;
}

export interface DigestFlushJobData {
  subscriberId: string;
  environmentId: string;
  organizationId: string;
  digestKey: string;
  workflowId: string;
  stepId: string;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    @InjectQueue(DIGEST_QUEUE) private digestQueue: Queue,
    private digestWindowService: DigestWindowService,
  ) {}

  private hashKey(
    digestKey: string,
    subscriberId: string,
    environmentId: string,
    workflowId: string,
    stepId: string,
  ) {
    return `digest:${environmentId}:${workflowId}:${stepId}:${digestKey}:${subscriberId}`;
  }

  private getRedis() {
    const client = (this.digestQueue as any).client;
    if (client && typeof client.hset === 'function') return client;
    if (client && typeof client.then === 'function') {
      this.logger.warn('digestQueue.client is a Promise; operations may be delayed');
    }
    return client as any;
  }

  async collect(input: DigestCollectInput) {
    const key = this.hashKey(
      input.digestKey,
      input.subscriberId,
      input.environmentId,
      input.workflowId,
      input.stepId,
    );
    const redis = this.getRedis();
    const eventId = uuidv4();
    await redis.hset(
      key,
      eventId,
      JSON.stringify({
        payload: input.payload,
        transactionId: input.transactionId,
        timestamp: Date.now(),
      }),
    );

    const windowMin = await this.digestWindowService.getWindowMinutes({
      environmentId: input.environmentId,
      critical: input.critical,
    });

    const ttlMs = Math.max(1, windowMin) * 60 * 1000;
    const scheduledJobId = `scheduled:${key}`;
    const existing = await this.digestQueue.getJob(scheduledJobId);
    if (!existing) {
      const jobData: DigestFlushJobData = {
        subscriberId: input.subscriberId,
        environmentId: input.environmentId,
        organizationId: input.organizationId,
        digestKey: input.digestKey,
        workflowId: input.workflowId,
        stepId: input.stepId,
      };
      const delay = windowMin <= 0 ? 0 : ttlMs;
      await this.digestQueue.add(`flush:${key}`, jobData, {
        jobId: scheduledJobId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      });
    }
    return { scheduled: true, windowMinutes: windowMin };
  }
}

@Processor(DIGEST_QUEUE)
export class DigestFlushWorker extends WorkerHost {
  private readonly logger = new Logger(DigestFlushWorker.name);

  constructor(
    @InjectQueue(DIGEST_QUEUE) private digestQueue: Queue,
    private templateRepo: NotificationTemplateRepository,
    private subscriberRepo: SubscriberRepository,
    private messageRepo: MessageRepository,
    private controlValuesRepo: ControlValuesRepository,
    private eventEmitter: EventEmitter2,
  ) {
    super();
  }

  private getRedis() {
    const client = (this.digestQueue as any).client;
    if (client && typeof client.hgetall === 'function') return client;
    return client as any;
  }

  async process(job: Job<DigestFlushJobData>) {
    const data = job.data;
    const redis = this.getRedis();
    const hashKey = `digest:${data.environmentId}:${data.workflowId}:${data.stepId}:${data.digestKey}:${data.subscriberId}`;
    const collected = await redis.hgetall(hashKey);
    if (!collected || Object.keys(collected).length === 0) {
      return { skipped: true, reason: 'empty_digest' };
    }

    const events: Array<{ payload: any; transactionId: string; timestamp: number }> = [];
    for (const val of Object.values(collected)) {
      try {
        events.push(JSON.parse(String(val)));
      } catch {}
    }
    await redis.del(hashKey);

    const workflow = await this.templateRepo.findById(data.workflowId);
    const subscriber = await this.subscriberRepo.findById(data.subscriberId);
    if (!workflow || !subscriber) {
      return { skipped: true, reason: 'missing_entities' };
    }

    const step = workflow.steps.find((s) => s._id === data.stepId);
    if (!step) {
      return { skipped: true, reason: 'step_not_found' };
    }

    const stepControls = await this.controlValuesRepo.find({
      _workflowId: workflow._id,
      _stepId: step._id,
      _environmentId: data.environmentId,
    });
    const controls = stepControls
      .filter((c) => c.level === DigestLevelEnum.STEP_CONTROLS)
      .reduce((acc, c) => ({ ...acc, ...(c.controls || {}) }), {});

    const channel = step.type === ChannelTypeEnum.DIGEST
      ? ChannelTypeEnum.IN_APP
      : (step.type as ChannelTypeEnum);

    const rendered = this.renderDigest(
      step,
      events.map((e) => e.payload),
      {
        controls,
        subscriber: {
          subscriberId: subscriber.subscriberId,
          firstName: subscriber.firstName,
          lastName: subscriber.lastName,
          email: subscriber.email,
          data: subscriber.data,
        },
      },
    );

    const messageData = {
      channel,
      content: rendered.content,
      subject: rendered.subject,
      seen: false,
      read: false,
      archived: false,
      status: MessageStatusEnum.SENT,
      transactionId: events[0]?.transactionId || uuidv4(),
      _templateId: workflow._id as MongooseTypes.ObjectId,
      _subscriberId: subscriber._id as MongooseTypes.ObjectId,
      _environmentId: new MongooseTypes.ObjectId(data.environmentId),
      _organizationId: new MongooseTypes.ObjectId(data.organizationId),
    };

    const msg = await this.messageRepo.insertIfNotExists(messageData);
    if (msg && channel === ChannelTypeEnum.IN_APP) {
      this.eventEmitter.emit('message.saved', { message: msg });
    }

    return { flushed: true, eventCount: events.length, channel };
  }

  private renderDigest(
    step: any,
    payloads: any[],
    vars: any,
  ): { content: string; subject?: string } {
    const tpl = step.template || {};
    const itemTemplate = tpl.body || '<div>{{summary}}</div>';
    const itemsHtml = payloads
      .map((p, i) => {
        const subst = (s: string): string =>
          s.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path) => {
            const parts = path.split('.');
            let cur: any = {
              ...vars,
              payload: p,
              index: i,
              count: payloads.length,
              summary: typeof p === 'object' ? JSON.stringify(p).slice(0, 140) : String(p),
            };
            for (const part of parts) {
              if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
              else return '';
            }
            return cur == null ? '' : String(cur);
          });
        return subst(itemTemplate);
      })
      .join('\n');
    const wrap = tpl.html
      ? tpl.html.replace(/\{\{items\}\}/g, itemsHtml).replace(/\{\{count\}\}/g, String(payloads.length))
      : `<div><h3>You have ${payloads.length} new updates</h3>\n${itemsHtml}\n</div>`;
    return {
      subject: (tpl.subject || 'You have updates').replace(/\{\{count\}\}/g, String(payloads.length)),
      content: wrap,
    };
  }
}
