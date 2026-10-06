import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Environment, EnvironmentDocument } from '../../environments/environment.schema';
import { ErrorCode } from '@campus/shared';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    @InjectModel(Environment.name)
    private environmentModel: Model<EnvironmentDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const apiKey = req.headers['apikey'] || req.headers['ApiKey'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException({
        error: ErrorCode.UNAUTHORIZED,
        message: 'Missing ApiKey header',
      });
    }

    const envs = await this.environmentModel
      .find({ 'apiKeys.key': { $exists: true } })
      .exec();

    for (const env of envs) {
      for (const k of env.apiKeys) {
        if (k.key) {
          const match = await bcrypt.compare(apiKey, k.hash);
          if (match) {
            req.user = {
              _userId: k._userId,
              _environmentId: env._id,
              _organizationId: env._organizationId,
              envType: env.type,
              isApiKey: true,
            };
            return true;
          }
        }
      }
    }

    throw new UnauthorizedException({
      error: ErrorCode.UNAUTHORIZED,
      message: 'Invalid ApiKey',
    });
  }
}
