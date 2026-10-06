import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EnvironmentRepository } from './environment.repository';
import { EnvironmentTypeEnum } from '@campus/shared';

@Controller({ path: 'environments', version: '1' })
@UseGuards(AuthGuard('jwt'))
export class EnvironmentsController {
  constructor(private envRepo: EnvironmentRepository) {}

  @Get()
  async list(@Request() req: any) {
    const orgId = req.user?._organizationId;
    if (!orgId) return { data: [] };
    const envs = await this.envRepo.listForOrganization(orgId.toString());
    const data = envs.map((env) => ({
      id: env._id.toString(),
      name:
        env.type === EnvironmentTypeEnum.DEV
          ? 'Development'
          : env.type === EnvironmentTypeEnum.PROD
            ? 'Production'
            : String(env.type || 'Environment'),
      key: (env.type || '').toString().toLowerCase(),
      type: env.type,
      identifier: env.identifier,
    }));
    return { data, total: data.length };
  }
}
