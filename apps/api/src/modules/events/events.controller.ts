import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Version,
} from '@nestjs/common';
import { TriggerService } from './trigger.service';
import { TriggerEventDto } from './dtos/trigger-event.dto';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsEnum } from '@campus/shared';

@Controller({ path: 'events', version: '1' })
export class EventsController {
  constructor(private triggerService: TriggerService) {}

  @Post('trigger')
  @UseGuards(ApiKeyAuthGuard)
  @RequirePermissions(PermissionsEnum.EVENT_WRITE)
  async trigger(@Body() dto: TriggerEventDto, @Request() req: any) {
    return this.triggerService.trigger(dto, {
      _environmentId: req.user._environmentId,
      _organizationId: req.user._organizationId,
    });
  }
}
