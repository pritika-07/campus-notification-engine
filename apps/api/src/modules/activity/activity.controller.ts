import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Sse,
  MessageEvent,
  Param,
  Post,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import { ExecutionDetailRepository } from '../execution-details/execution-detail.repository';
import { MessageRepository } from '../messages/message.repository';
import { SubscriberRepository } from '../subscribers/subscriber.repository';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PermissionsEnum, ChannelTypeEnum, ErrorCode } from '@campus/shared';
import { MessageDocument } from '../messages/message.schema';

interface ActivitySseContext {
  subscriberId: string;
  subject: Subject<MessageEvent>;
}

@Controller({ version: '1' })
export class ActivityController {
  private sseConnections: Map<string, ActivitySseContext> = new Map();

  constructor(
    private executionDetailRepo: ExecutionDetailRepository,
    private messageRepo: MessageRepository,
    private subscriberRepo: SubscriberRepository,
  ) {}

  @Get('activity')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(PermissionsEnum.NOTIFICATION_READ)
  async listActivity(@Request() req: any, @Query() query: any) {
    const limit = Math.min(Number(query.limit || 50), 200);
    const skip = Number(query.skip || 0);
    const sort = { createdAt: -1 };
    const filter: any = {};
    if (req.user._organizationId) filter._organizationId = req.user._organizationId;
    if (req.user._environmentId) filter._environmentId = req.user._environmentId;
    if (query.channel) filter.channel = query.channel;
    if (query.status) filter.status = query.status;
    const [data, total] = await Promise.all([
      this.executionDetailRepo.find(filter, { limit, skip, sort }),
      this.executionDetailRepo.count(filter),
    ]);
    return { data, total, limit, skip };
  }

  @Sse('sse')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  sse(@Request() req: any): Observable<MessageEvent> {
    const subscriberId = req.user?.subscriberId || req.user?._id;
    const subject = new Subject<MessageEvent>();
    const key = `${subscriberId}:${Date.now()}`;
    this.sseConnections.set(key, {
      subscriberId: String(subscriberId),
      subject,
    });
    const heartbeat = setInterval(() => {
      try {
        subject.next({ type: 'ping', data: { t: Date.now() } });
      } catch {}
    }, 30000);
    subject.subscribe({
      complete: () => {
        clearInterval(heartbeat);
        this.sseConnections.delete(key);
      },
      error: () => {
        clearInterval(heartbeat);
        this.sseConnections.delete(key);
      },
    });
    return subject.asObservable();
  }

  @OnEvent('message.saved')
  handleMessageSaved(payload: { message: MessageDocument }) {
    const msg = payload.message;
    if (!msg) return;
    const subId = String(msg._subscriberId);
    for (const ctx of this.sseConnections.values()) {
      if (ctx.subscriberId === subId) {
        try {
          ctx.subject.next({
            type: 'notification_received',
            data: {
              messageId: msg._id,
              channel: msg.channel,
              content: msg.content,
              subject: msg.subject,
              createdAt: msg.createdAt,
              transactionId: msg.transactionId,
            },
          });
        } catch {}
      }
    }
  }

  @Get('inbox')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  async getInbox(@Request() req: any, @Query() query: any) {
    const limit = Math.min(Number(query.limit || 30), 100);
    const skip = Number(query.skip || 0);
    const subscriberId = req.user?.subscriberId || req.user?._id;
    if (!subscriberId) {
      return { data: [], total: 0, limit, skip };
    }
    const filter: any = {
      _subscriberId: subscriberId,
      archived: { $ne: true },
    };
    if (req.user._environmentId) filter._environmentId = req.user._environmentId;
    if (query.channel) filter.channel = query.channel;
    if (query.seen !== undefined) filter.seen = query.seen === 'true' || query.seen === true;
    if (query.read !== undefined) filter.read = query.read === 'true' || query.read === true;
    if (!query.includeArchived || query.includeArchived === 'false') {
      filter.archived = { $ne: true };
    }
    const sort = { createdAt: -1 };
    const [data, total] = await Promise.all([
      this.messageRepo.find(filter, { limit, skip, sort }),
      this.messageRepo.count(filter),
    ]);
    const unread = await this.messageRepo.count({ ...filter, read: false });
    return { data, total, limit, skip, unread };
  }

  @Post('messages/:id/seen')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  async markSeen(@Param('id') id: string) {
    const msg = await this.messageRepo.updateById(id, { $set: { seen: true } } as any);
    if (!msg) {
      throw new NotFoundException({
        error: ErrorCode.SUBSCRIBER_NOT_FOUND,
        message: 'Message not found',
      });
    }
    return msg;
  }

  @Post('messages/:id/read')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  async markRead(@Param('id') id: string) {
    const msg = await this.messageRepo.updateById(id, { $set: { read: true, seen: true } } as any);
    if (!msg) {
      throw new NotFoundException({
        error: ErrorCode.SUBSCRIBER_NOT_FOUND,
        message: 'Message not found',
      });
    }
    return msg;
  }

  @Post('messages/:id/archive')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  async archive(@Param('id') id: string) {
    const msg = await this.messageRepo.updateById(id, { $set: { archived: true } } as any);
    if (!msg) {
      throw new NotFoundException({
        error: ErrorCode.SUBSCRIBER_NOT_FOUND,
        message: 'Message not found',
      });
    }
    return msg;
  }
}
