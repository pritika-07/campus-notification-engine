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
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types as MongooseTypes } from 'mongoose';
import { IntegrationRepository } from './integration.repository';
import { AcademicCalendarRepository } from './academic-calendar.repository';
import { UpsertIntegrationDto } from './dtos/integration.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  PermissionsEnum,
  ErrorCode,
  AcademicPeriodEnum,
} from '@campus/shared';
import { encrypt, decrypt } from '../../common/helpers/crypto.helper';

@Controller({ version: '1' })
@UseGuards(AuthGuard('jwt'))
export class IntegrationsController {
  constructor(
    private integrationRepo: IntegrationRepository,
    private academicCalendarRepo: AcademicCalendarRepository,
  ) {}

  private getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY || '00000000000000000000000000000000';
    return key.padEnd(64, '0').slice(0, 64);
  }

  @Get('integrations')
  @RequirePermissions(PermissionsEnum.INTEGRATION_READ)
  async listIntegrations(@Request() req: any, @Query() query: any) {
    const filter: any = {
      _organizationId: req.user._organizationId,
    };
    if (req.user._environmentId) filter._environmentId = req.user._environmentId;
    if (query.channel) filter.channel = query.channel;
    const data = await this.integrationRepo.find(filter);
    const key = this.getEncryptionKey();
    const sanitized = data.map((i) => {
      return {
        _id: i._id,
        providerId: i.providerId,
        channel: i.channel,
        active: i.active,
        _environmentId: i._environmentId,
        _organizationId: i._organizationId,
        createdAt: (i as any).createdAt,
      };
    });
    return { data: sanitized, total: sanitized.length };
  }

  @Get('integrations/:id')
  @RequirePermissions(PermissionsEnum.INTEGRATION_READ)
  async getIntegration(@Param('id') id: string, @Request() req: any) {
    const i = await this.integrationRepo.findById(id);
    if (!i) {
      throw new NotFoundException({
        error: ErrorCode.INTEGRATION_NOT_FOUND,
        message: 'Integration not found',
      });
    }
    return {
      _id: i._id,
      providerId: i.providerId,
      channel: i.channel,
      active: i.active,
      _environmentId: i._environmentId,
      _organizationId: i._organizationId,
      createdAt: (i as any).createdAt,
    };
  }

  @Post('integrations')
  @RequirePermissions(PermissionsEnum.INTEGRATION_WRITE)
  async createIntegration(@Body() dto: UpsertIntegrationDto, @Request() req: any) {
    const key = this.getEncryptionKey();
    const encryptedCreds: Record<string, any> = {};
    for (const [k, v] of Object.entries(dto.credentials || {})) {
      encryptedCreds[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ? encrypt(String(v), key)
        : encrypt(JSON.stringify(v), key);
    }
    return this.integrationRepo.create({
      providerId: dto.providerId,
      channel: dto.channel,
      active: dto.active ?? true,
      credentials: { _encrypted: true, fields: encryptedCreds },
      _environmentId: new MongooseTypes.ObjectId(req.user._environmentId),
      _organizationId: new MongooseTypes.ObjectId(req.user._organizationId),
    });
  }

  @Put('integrations/:id')
  @RequirePermissions(PermissionsEnum.INTEGRATION_WRITE)
  async updateIntegration(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertIntegrationDto>,
    @Request() req: any,
  ) {
    const existing = await this.integrationRepo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: ErrorCode.INTEGRATION_NOT_FOUND,
        message: 'Integration not found',
      });
    }
    const update: any = {};
    if (dto.providerId !== undefined) update.providerId = dto.providerId;
    if (dto.channel !== undefined) update.channel = dto.channel;
    if (dto.active !== undefined) update.active = dto.active;
    if (dto.credentials) {
      const key = this.getEncryptionKey();
      const encryptedCreds: Record<string, any> = {};
      for (const [k, v] of Object.entries(dto.credentials)) {
        encryptedCreds[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          ? encrypt(String(v), key)
          : encrypt(JSON.stringify(v), key);
      }
      update.credentials = { _encrypted: true, fields: encryptedCreds };
    }
    return this.integrationRepo.updateById(id, { $set: update } as any);
  }

  @Delete('integrations/:id')
  @RequirePermissions(PermissionsEnum.INTEGRATION_WRITE)
  async deleteIntegration(@Param('id') id: string) {
    const i = await this.integrationRepo.deleteById(id);
    if (!i) {
      throw new NotFoundException({
        error: ErrorCode.INTEGRATION_NOT_FOUND,
        message: 'Integration not found',
      });
    }
    return { success: true };
  }

  @Get('academic-calendar')
  @RequirePermissions(PermissionsEnum.INTEGRATION_READ)
  async getAcademicCalendar(@Request() req: any) {
    const envId = req.user._environmentId;
    const entries = await this.academicCalendarRepo.find(
      { _environmentId: envId },
      { sort: { effectiveFrom: 1 } },
    );
    const current = await this.academicCalendarRepo.getCurrentPeriodForEnvironment(envId);
    return { entries, current };
  }

  @Put('academic-calendar')
  @RequirePermissions(PermissionsEnum.INTEGRATION_WRITE)
  async setAcademicCalendar(
    @Body()
    body: {
      entries: Array<{ period: AcademicPeriodEnum; effectiveFrom: string | Date; effectiveTo: string | Date }>;
    },
    @Request() req: any,
  ) {
    const envId = req.user._environmentId;
    const orgId = req.user._organizationId;
    if (!body?.entries || !Array.isArray(body.entries)) {
      throw new BadRequestException({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'entries array is required',
      });
    }
    for (const e of body.entries) {
      if (!Object.values(AcademicPeriodEnum).includes(e.period)) {
        throw new BadRequestException({
          error: ErrorCode.VALIDATION_ERROR,
          message: `Invalid period: ${e.period}`,
        });
      }
    }
    await this.academicCalendarRepo.deleteMany({ _environmentId: envId });
    const created = [];
    for (const e of body.entries) {
      created.push(
        await this.academicCalendarRepo.create({
          _environmentId: new MongooseTypes.ObjectId(envId),
          period: e.period,
          effectiveFrom: new Date(e.effectiveFrom),
          effectiveTo: new Date(e.effectiveTo),
        }),
      );
    }
    const current = await this.academicCalendarRepo.getCurrentPeriodForEnvironment(envId);
    return { entries: created, current };
  }
}
