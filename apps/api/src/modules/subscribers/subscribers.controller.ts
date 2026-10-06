import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriberRepository } from './subscriber.repository';
import { UpsertSubscriberDto } from './dtos/upsert-subscriber.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsEnum, ErrorCode } from '@campus/shared';

@Controller({ path: 'subscribers', version: '2' })
@UseGuards(AuthGuard('jwt'))
export class SubscribersController {
  constructor(private subscriberRepo: SubscriberRepository) {}

  @Get()
  @RequirePermissions(PermissionsEnum.SUBSCRIBER_READ)
  async list(@Request() req: any, @Query() query: any) {
    const limit = Number(query.limit || 50);
    const skip = Number(query.skip || 0);
    const filter: any = {
      _organizationId: req.user._organizationId,
    };
    if (req.user._environmentId) {
      filter._environmentId = req.user._environmentId;
    }
    const data = await this.subscriberRepo.find(filter, { limit, skip });
    return { data, total: data.length, limit, skip };
  }

  @Get(':id')
  @RequirePermissions(PermissionsEnum.SUBSCRIBER_READ)
  async getById(@Param('id') id: string) {
    const subscriber = await this.subscriberRepo.findById(id);
    if (!subscriber) {
      throw new NotFoundException({
        error: ErrorCode.SUBSCRIBER_NOT_FOUND,
        message: 'Subscriber not found',
      });
    }
    return subscriber;
  }

  @Post()
  @RequirePermissions(PermissionsEnum.SUBSCRIBER_WRITE)
  async create(@Body() dto: UpsertSubscriberDto, @Request() req: any) {
    return this.subscriberRepo.create({
      subscriberId: dto.subscriberId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      locale: dto.locale,
      timezone: dto.timezone,
      isOnline: dto.isOnline,
      data: dto.data,
      channels: dto.channels as any,
      _environmentId: req.user._environmentId,
      _organizationId: req.user._organizationId,
    });
  }

  @Put(':id')
  @RequirePermissions(PermissionsEnum.SUBSCRIBER_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertSubscriberDto>,
  ) {
    const existing = await this.subscriberRepo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: ErrorCode.SUBSCRIBER_NOT_FOUND,
        message: 'Subscriber not found',
      });
    }
    const updateData: any = {};
    for (const key of Object.keys(dto)) {
      if ((dto as any)[key] !== undefined) updateData[key] = (dto as any)[key];
    }
    if (dto.channels) {
      const mergedChannels: any = { ...(existing.channels || {}) };
      for (const c of Object.keys(dto.channels)) {
        mergedChannels[c] = {
          ...(mergedChannels[c] || {}),
          ...((dto.channels as any)[c] || {}),
        };
      }
      updateData.channels = mergedChannels;
    }
    return this.subscriberRepo.updateById(id, updateData);
  }

  @Delete(':id')
  @RequirePermissions(PermissionsEnum.SUBSCRIBER_WRITE)
  async remove(@Param('id') id: string) {
    const subscriber = await this.subscriberRepo.deleteById(id);
    if (!subscriber) {
      throw new NotFoundException({
        error: ErrorCode.SUBSCRIBER_NOT_FOUND,
        message: 'Subscriber not found',
      });
    }
    return { success: true };
  }
}
