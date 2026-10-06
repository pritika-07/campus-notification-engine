import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Member, MemberDocument } from '../members/member.schema';
import { Environment, EnvironmentDocument } from '../environments/environment.schema';
import { EnvironmentTypeEnum, ErrorCode } from '@campus/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
    @InjectModel(Environment.name) private environmentModel: Model<EnvironmentDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-change-me',
    });
  }

  async validate(payload: { sub: string }) {
    const member = await this.memberModel.findOne({ _userId: payload.sub }).sort({ createdAt: 1 }).exec();
    if (!member) {
      throw new UnauthorizedException({
        error: ErrorCode.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }
    const devEnv = await this.environmentModel
      .findOne({
        _organizationId: member._organizationId,
        type: EnvironmentTypeEnum.DEV,
      })
      .exec();
    return {
      _id: payload.sub,
      _userId: payload.sub,
      _organizationId: member._organizationId,
      _environmentId: devEnv?._id || null,
      roles: member.roles,
    };
  }
}
