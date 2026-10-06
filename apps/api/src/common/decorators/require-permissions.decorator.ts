import { SetMetadata } from '@nestjs/common';
import { PermissionsEnum } from '@campus/shared';

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';
export const RequirePermissions = (...permissions: PermissionsEnum[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
