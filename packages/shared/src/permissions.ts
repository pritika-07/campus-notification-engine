export enum PermissionsEnum {
  WORKFLOW_READ = 'workflow:read',
  WORKFLOW_WRITE = 'workflow:write',
  SUBSCRIBER_READ = 'subscriber:read',
  SUBSCRIBER_WRITE = 'subscriber:write',
  NOTIFICATION_READ = 'notification:read',
  EVENT_WRITE = 'event:write',
  API_KEY_READ = 'api_key:read',
  INTEGRATION_READ = 'integration:read',
  INTEGRATION_WRITE = 'integration:write',
}

export enum RoleEnum {
  ADMIN = 'admin',
  MEMBER = 'member',
}

export const ROLE_PERMISSIONS: Record<RoleEnum, PermissionsEnum[]> = {
  [RoleEnum.ADMIN]: Object.values(PermissionsEnum),
  [RoleEnum.MEMBER]: [
    PermissionsEnum.WORKFLOW_READ,
    PermissionsEnum.SUBSCRIBER_READ,
    PermissionsEnum.NOTIFICATION_READ,
    PermissionsEnum.INTEGRATION_READ,
  ],
};
