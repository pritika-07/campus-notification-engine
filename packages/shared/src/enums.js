"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestLevelEnum = exports.AcademicPeriodEnum = exports.ExecutionStatusEnum = exports.MessageStatusEnum = exports.EnvironmentTypeEnum = exports.ChannelTypeEnum = exports.ErrorCode = void 0;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["WORKFLOW_NOT_FOUND"] = "WORKFLOW_NOT_FOUND";
    ErrorCode["STEP_NOT_IN_WORKFLOW"] = "STEP_NOT_IN_WORKFLOW";
    ErrorCode["STEP_ID_COLLISION"] = "STEP_ID_COLLISION";
    ErrorCode["SUBSCRIBER_ALREADY_EXISTS"] = "SUBSCRIBER_ALREADY_EXISTS";
    ErrorCode["SUBSCRIBER_NOT_FOUND"] = "SUBSCRIBER_NOT_FOUND";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["MALFORMED_HTML"] = "MALFORMED_HTML";
    ErrorCode["PREVIEW_RENDER_FAILED"] = "PREVIEW_RENDER_FAILED";
    ErrorCode["CROSS_ORG_SYNC"] = "CROSS_ORG_SYNC";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["PAYLOAD_VALIDATION_FAILED"] = "PAYLOAD_VALIDATION_FAILED";
    ErrorCode["INTEGRATION_NOT_FOUND"] = "INTEGRATION_NOT_FOUND";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["TRANSACTION_FAILED"] = "TRANSACTION_FAILED";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
var ChannelTypeEnum;
(function (ChannelTypeEnum) {
    ChannelTypeEnum["EMAIL"] = "email";
    ChannelTypeEnum["SMS"] = "sms";
    ChannelTypeEnum["PUSH"] = "push";
    ChannelTypeEnum["IN_APP"] = "in_app";
    ChannelTypeEnum["CHAT"] = "chat";
    ChannelTypeEnum["DIGEST"] = "digest";
    ChannelTypeEnum["DELAY"] = "delay";
})(ChannelTypeEnum || (exports.ChannelTypeEnum = ChannelTypeEnum = {}));
var EnvironmentTypeEnum;
(function (EnvironmentTypeEnum) {
    EnvironmentTypeEnum["DEV"] = "DEV";
    EnvironmentTypeEnum["PROD"] = "PROD";
})(EnvironmentTypeEnum || (exports.EnvironmentTypeEnum = EnvironmentTypeEnum = {}));
var MessageStatusEnum;
(function (MessageStatusEnum) {
    MessageStatusEnum["SENT"] = "sent";
    MessageStatusEnum["ERROR"] = "error";
    MessageStatusEnum["WARNING"] = "warning";
})(MessageStatusEnum || (exports.MessageStatusEnum = MessageStatusEnum = {}));
var ExecutionStatusEnum;
(function (ExecutionStatusEnum) {
    ExecutionStatusEnum["SUCCESS"] = "success";
    ExecutionStatusEnum["FAILED"] = "failed";
    ExecutionStatusEnum["PENDING"] = "pending";
    ExecutionStatusEnum["QUEUED"] = "queued";
})(ExecutionStatusEnum || (exports.ExecutionStatusEnum = ExecutionStatusEnum = {}));
var AcademicPeriodEnum;
(function (AcademicPeriodEnum) {
    AcademicPeriodEnum["REGULAR_WEEK"] = "regular_week";
    AcademicPeriodEnum["EXAM_PERIOD"] = "exam_period";
    AcademicPeriodEnum["ORIENTATION"] = "orientation";
    AcademicPeriodEnum["HOLIDAY"] = "holiday";
})(AcademicPeriodEnum || (exports.AcademicPeriodEnum = AcademicPeriodEnum = {}));
var DigestLevelEnum;
(function (DigestLevelEnum) {
    DigestLevelEnum["STEP_CONTROLS"] = "STEP_CONTROLS";
    DigestLevelEnum["STEP_PROVIDER_CONTROLS"] = "STEP_PROVIDER_CONTROLS";
})(DigestLevelEnum || (exports.DigestLevelEnum = DigestLevelEnum = {}));
