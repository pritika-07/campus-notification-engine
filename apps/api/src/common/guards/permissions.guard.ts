import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionsEnum, RoleEnum, ROLE_PERMISSIONS, ErrorCode } from '@campus/shared';
import { Member, MemberDocument } from '../../modules/members/member.schema';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionsEnum[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const userId = req.user?._id;
    const organizationId = req.user?._organizationId;

    if (!userId || !organizationId) {
      throw new ForbiddenException({
        error: ErrorCode.FORBIDDEN,
        message: 'No user context available',
      });
    }

    const member = await this.memberModel.findOne({
      _userId: userId,
      _organizationId: organizationId,
    });

    if (!member) {
      throw new ForbiddenException({
        error: ErrorCode.FORBIDDEN,
        message: 'Member not found',
      });
    }

    const userPermissions: PermissionsEnum[] = [];
    for (const role of member.roles) {
      const perms = ROLE_PERMISSIONS[role as RoleEnum] || [];
      userPermissions.push(...perms);
    }

    const hasAll = requiredPermissions.every((p) => userPermissions.includes(p));
    if (!hasAll) {
      throw new ForbiddenException({
        error: ErrorCode.FORBIDDEN,
        message: 'Insufficient permissions',
      });
    }

    return true;
  }
}
