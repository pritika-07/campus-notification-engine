import { PermissionsEnum, RoleEnum, ROLE_PERMISSIONS } from './permissions';
import { ErrorCode, ChannelTypeEnum, EnvironmentTypeEnum, MessageStatusEnum, ExecutionStatusEnum, AcademicPeriodEnum, DigestLevelEnum } from './enums';
export { PermissionsEnum, RoleEnum, ROLE_PERMISSIONS, ErrorCode, ChannelTypeEnum, EnvironmentTypeEnum, MessageStatusEnum, ExecutionStatusEnum, AcademicPeriodEnum, DigestLevelEnum, };
export interface StandardError {
    statusCode: number;
    error: ErrorCode | string;
    message: string;
}
export interface ApiKeyDto {
    key: string;
    hash: string;
    _userId: string;
}
export interface ChannelPreferences {
    email?: {
        enabled: boolean;
    };
    sms?: {
        enabled: boolean;
    };
    push?: {
        enabled: boolean;
    };
    in_app?: {
        enabled: boolean;
    };
    chat?: {
        enabled: boolean;
    };
}
