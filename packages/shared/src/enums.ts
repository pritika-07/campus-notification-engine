export enum ErrorCode {
  WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND',
  STEP_NOT_IN_WORKFLOW = 'STEP_NOT_IN_WORKFLOW',
  STEP_ID_COLLISION = 'STEP_ID_COLLISION',
  SUBSCRIBER_ALREADY_EXISTS = 'SUBSCRIBER_ALREADY_EXISTS',
  SUBSCRIBER_NOT_FOUND = 'SUBSCRIBER_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  MALFORMED_HTML = 'MALFORMED_HTML',
  PREVIEW_RENDER_FAILED = 'PREVIEW_RENDER_FAILED',
  CROSS_ORG_SYNC = 'CROSS_ORG_SYNC',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PAYLOAD_VALIDATION_FAILED = 'PAYLOAD_VALIDATION_FAILED',
  INTEGRATION_NOT_FOUND = 'INTEGRATION_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
}

export enum ChannelTypeEnum {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
  CHAT = 'chat',
  DIGEST = 'digest',
  DELAY = 'delay',
}

export enum EnvironmentTypeEnum {
  DEV = 'DEV',
  PROD = 'PROD',
}

export enum MessageStatusEnum {
  SENT = 'sent',
  ERROR = 'error',
  WARNING = 'warning',
}

export enum ExecutionStatusEnum {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
  QUEUED = 'queued',
}

export enum AcademicPeriodEnum {
  REGULAR_WEEK = 'regular_week',
  EXAM_PERIOD = 'exam_period',
  ORIENTATION = 'orientation',
  HOLIDAY = 'holiday',
}

export enum DigestLevelEnum {
  STEP_CONTROLS = 'STEP_CONTROLS',
  STEP_PROVIDER_CONTROLS = 'STEP_PROVIDER_CONTROLS',
}
